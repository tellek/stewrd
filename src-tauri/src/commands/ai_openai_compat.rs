// The OpenAI-compatible API providers (OpenAI, Gemini, Grok, and the custom
// bring-your-own endpoint) for ctx.api.ai.run - see host/api/ai.ts. One
// streaming /chat/completions implementation covers all of them. Same
// process-output:/process-exit: event contract as ai_anthropic.rs, and the
// same requirement that JS registers both listeners before invoking.
//
// The base URL is never accepted over IPC: plugins can call any command with
// raw invoke(), so a caller-supplied URL would let them send a stored key to
// any host. Built-in providers use the constants below; the custom provider's
// URL comes from the same keychain entry as its key (see secrets.rs).
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;

use super::ai_anthropic::{cleanup, emit_exit, emit_output};
use super::secrets::{read_custom_endpoint, read_key};
use crate::state::AppState;

fn builtin_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"),
        "gemini" => Some("https://generativelanguage.googleapis.com/v1beta/openai"),
        "grok" => Some("https://api.x.ai/v1"),
        _ => None,
    }
}

/// (chat completions URL, optional bearer key) for a provider.
fn resolve_endpoint(provider: &str) -> Result<(String, Option<String>), String> {
    if provider == "custom" {
        let (base, key) = read_custom_endpoint()?
            .ok_or_else(|| "No custom endpoint configured - add one in Settings > AI".to_string())?;
        return Ok((format!("{}/chat/completions", base.trim_end_matches('/')), key));
    }
    let base = builtin_base_url(provider).ok_or_else(|| format!("unknown AI provider: {provider}"))?;
    let key = read_key(provider)?.ok_or_else(|| format!("No {provider} API key configured - add one in Settings > AI"))?;
    Ok((format!("{base}/chat/completions"), Some(key)))
}

#[derive(Debug, PartialEq)]
enum SseItem {
    Text(String),
    Done,
    Error(String),
}

/// Parses complete `data: ...` SSE lines out of `buf`, leaving any trailing
/// partial line buffered for the next chunk. Text lives in
/// choices[0].delta.content (null on the role-only first chunk and the final
/// chunk); the stream ends with the literal `data: [DONE]`.
fn drain_sse(buf: &mut String) -> Vec<SseItem> {
    let mut items = Vec::new();
    let mut consumed_upto = 0;
    for line in buf.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break;
        }
        consumed_upto += line.len();
        let Some(data) = line.trim().strip_prefix("data:") else { continue };
        let data = data.trim();
        if data == "[DONE]" {
            items.push(SseItem::Done);
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(data) else { continue };
        if let Some(error) = value.get("error") {
            items.push(SseItem::Error(error.to_string()));
        } else if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
            if !text.is_empty() {
                items.push(SseItem::Text(text.to_string()));
            }
        }
    }
    buf.drain(..consumed_upto);
    items
}

#[tauri::command]
pub async fn ai_run_openai_compat(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    provider: String,
    model: String,
    prompt: String,
) -> Result<(), String> {
    if model.trim().is_empty() {
        return Err("No model configured - set one in Settings > AI".to_string());
    }
    let (url, key) = resolve_endpoint(&provider)?;

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    state.ai_cancel_senders.lock().unwrap().insert(id.clone(), cancel_tx);

    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_request(&app_for_task, &id, &url, key.as_deref(), &model, &prompt, &mut cancel_rx).await;
        match result {
            Ok(()) => emit_exit(&app_for_task, &id, 0),
            Err(Outcome::Cancelled) => emit_exit(&app_for_task, &id, -1),
            Err(Outcome::Failed(message)) => {
                emit_output(&app_for_task, &id, "stderr", message);
                emit_exit(&app_for_task, &id, 1);
            }
        }
        let app_state = app_for_task.state::<AppState>();
        cleanup(&app_state, &id);
    });
    Ok(())
}

enum Outcome {
    Cancelled,
    Failed(String),
}

async fn run_request(
    app: &AppHandle,
    id: &str,
    url: &str,
    key: Option<&str>,
    model: &str,
    prompt: &str,
    cancel_rx: &mut oneshot::Receiver<()>,
) -> Result<(), Outcome> {
    let client = reqwest::Client::new();
    // No token cap parameter: max_tokens vs max_completion_tokens differs
    // between OpenAI-compatible servers, and the provider default is fine.
    let body = json!({
        "model": model,
        "stream": true,
        "messages": [{"role": "user", "content": prompt}],
    });
    let mut request = client.post(url).json(&body);
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }

    let response = tokio::select! {
        result = request.send() => result.map_err(|e| Outcome::Failed(e.to_string()))?,
        _ = &mut *cancel_rx => return Err(Outcome::Cancelled),
    };
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(Outcome::Failed(format!("API error ({status}): {text}")));
    }

    let mut response = response;
    let mut buf = String::new();
    loop {
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|e| Outcome::Failed(e.to_string()))?,
            _ = &mut *cancel_rx => return Err(Outcome::Cancelled),
        };
        let Some(bytes) = chunk else { break };
        buf.push_str(&String::from_utf8_lossy(&bytes));
        for item in drain_sse(&mut buf) {
            match item {
                SseItem::Text(text) => emit_output(app, id, "stdout", text),
                SseItem::Error(message) => return Err(Outcome::Failed(message)),
                SseItem::Done => return Ok(()),
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn ai_cancel_openai_compat(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(tx) = state.ai_cancel_senders.lock().unwrap().remove(&id) {
        let _ = tx.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_text_delta_and_skips_the_role_only_chunk() {
        let mut buf = concat!(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n",
        )
        .to_string();
        assert_eq!(drain_sse(&mut buf), vec![SseItem::Text("hi".to_string())]);
        assert!(buf.is_empty());
    }

    #[test]
    fn ends_on_done_and_ignores_null_content() {
        let mut buf = "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n".to_string();
        assert_eq!(drain_sse(&mut buf), vec![SseItem::Done]);
    }

    #[test]
    fn buffers_an_event_split_across_two_chunks() {
        let mut buf = "data: {\"choices\":[{\"delta\":{\"con".to_string();
        assert!(drain_sse(&mut buf).is_empty());
        buf.push_str("tent\":\"yo\"}}]}\n\n");
        assert_eq!(drain_sse(&mut buf), vec![SseItem::Text("yo".to_string())]);
    }

    #[test]
    fn surfaces_an_error_payload() {
        let mut buf = "data: {\"error\":{\"message\":\"bad\"}}\n\n".to_string();
        assert!(matches!(drain_sse(&mut buf).as_slice(), [SseItem::Error(_)]));
    }

    #[test]
    fn builtin_providers_have_fixed_https_endpoints_and_unknown_is_rejected() {
        for p in ["openai", "gemini", "grok"] {
            assert!(builtin_base_url(p).unwrap().starts_with("https://"));
        }
        assert!(builtin_base_url("custom").is_none());
        assert!(resolve_endpoint("not-a-provider").is_err());
    }
}
