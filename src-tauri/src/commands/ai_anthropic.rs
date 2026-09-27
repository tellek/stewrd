// The "anthropic-api" provider path for ctx.api.ai.run - see host/api/ai.ts
// for the JS-side branch that calls into this. Mirrors the process-output:/
// process-exit: event contract shell.rs's spawn_command uses, so ai.ts can
// reuse the same listener shape for both providers, but there is no real OS
// process here - this streams an HTTP response instead. Callers on the JS
// side are required to have already registered both listeners (awaited)
// before invoking this command, since events start emitting as soon as the
// spawned task runs.
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use super::secrets::read_anthropic_key;
use crate::state::AppState;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-sonnet-5";
const MAX_TOKENS: u32 = 4096;

/// CLI-style aliases callers already pass (see paletteGenerator.ts's
/// `model: "sonnet"`) mapped to real Anthropic API model ids. Anything not
/// in this table is passed through unchanged - it may already be a full
/// model id.
fn resolve_model(model: Option<&str>) -> String {
    match model {
        None => DEFAULT_MODEL.to_string(),
        Some("sonnet") => "claude-sonnet-5".to_string(),
        Some("opus") => "claude-opus-5-5".to_string(),
        Some("haiku") => "claude-haiku-4-5-20251001".to_string(),
        Some(other) => other.to_string(),
    }
}

fn emit_output(app: &AppHandle, id: &str, stream: &'static str, chunk: String) {
    let _ = app.emit(&format!("process-output:{id}"), json!({"stream": stream, "chunk": chunk}));
}

fn emit_exit(app: &AppHandle, id: &str, code: i32) {
    let _ = app.emit(&format!("process-exit:{id}"), json!({"code": code}));
}

fn cleanup(state: &AppState, id: &str) {
    state.anthropic_cancel_senders.lock().unwrap().remove(id);
}

#[derive(Deserialize)]
struct SseDelta {
    #[serde(rename = "type")]
    kind: Option<String>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct SseEvent {
    #[serde(rename = "type")]
    kind: String,
    delta: Option<SseDelta>,
    error: Option<serde_json::Value>,
}

/// Parses complete `data: {...}` SSE lines out of `buf`, leaving any
/// trailing partial line in `buf` for the next chunk. Returns the parsed
/// events found in this call. Anthropic's stream also sends `event: <type>`
/// lines and blank separators - only `data:` lines carry the JSON payload
/// this needs.
fn drain_sse_events(buf: &mut String) -> Vec<SseEvent> {
    let mut events = Vec::new();
    let mut consumed_upto = 0;
    for line in buf.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // incomplete trailing line - keep it buffered
        }
        consumed_upto += line.len();
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data:") {
            if let Ok(event) = serde_json::from_str::<SseEvent>(data.trim()) {
                events.push(event);
            }
        }
    }
    buf.drain(..consumed_upto);
    events
}

#[tauri::command]
pub async fn ai_run_anthropic(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    prompt: String,
    model: Option<String>,
) -> Result<(), String> {
    let key = read_anthropic_key()?
        .ok_or_else(|| "No Anthropic API key configured - add one in Settings > AI".to_string())?;

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    state.anthropic_cancel_senders.lock().unwrap().insert(id.clone(), cancel_tx);

    let app_for_task = app.clone();
    let id_for_task = id.clone();
    let resolved_model = resolve_model(model.as_deref());
    tauri::async_runtime::spawn(async move {
        let result = run_request(&app_for_task, &id_for_task, &key, &prompt, &resolved_model, &mut cancel_rx).await;
        match result {
            Ok(()) => emit_exit(&app_for_task, &id_for_task, 0),
            Err(RequestOutcome::Cancelled) => emit_exit(&app_for_task, &id_for_task, -1),
            Err(RequestOutcome::Failed(message)) => {
                emit_output(&app_for_task, &id_for_task, "stderr", message);
                emit_exit(&app_for_task, &id_for_task, 1);
            }
        }
        let app_state = app_for_task.state::<AppState>();
        cleanup(&app_state, &id_for_task);
    });

    Ok(())
}

enum RequestOutcome {
    Cancelled,
    Failed(String),
}

async fn run_request(
    app: &AppHandle,
    id: &str,
    key: &str,
    prompt: &str,
    model: &str,
    cancel_rx: &mut oneshot::Receiver<()>,
) -> Result<(), RequestOutcome> {
    let client = reqwest::Client::new();
    let body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "messages": [{"role": "user", "content": prompt}],
    });

    let response = tokio::select! {
        result = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send() => result.map_err(|e| RequestOutcome::Failed(e.to_string()))?,
        _ = &mut *cancel_rx => return Err(RequestOutcome::Cancelled),
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(RequestOutcome::Failed(format!("Anthropic API error ({status}): {text}")));
    }

    let mut response = response;
    let mut buf = String::new();
    loop {
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|e| RequestOutcome::Failed(e.to_string()))?,
            _ = &mut *cancel_rx => return Err(RequestOutcome::Cancelled),
        };
        let Some(bytes) = chunk else { break }; // EOF
        buf.push_str(&String::from_utf8_lossy(&bytes));

        for event in drain_sse_events(&mut buf) {
            if let Some(error) = event.error {
                return Err(RequestOutcome::Failed(error.to_string()));
            }
            if event.kind == "content_block_delta" {
                if let Some(delta) = event.delta {
                    if delta.kind.as_deref() == Some("text_delta") {
                        if let Some(text) = delta.text {
                            emit_output(app, id, "stdout", text);
                        }
                    }
                }
            }
            if event.kind == "message_stop" {
                return Ok(());
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn ai_cancel_anthropic(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(tx) = state.anthropic_cancel_senders.lock().unwrap().remove(&id) {
        let _ = tx.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_cli_aliases_to_api_model_ids() {
        assert_eq!(resolve_model(Some("sonnet")), "claude-sonnet-5");
        assert_eq!(resolve_model(None), DEFAULT_MODEL);
        assert_eq!(resolve_model(Some("claude-opus-5-5")), "claude-opus-5-5");
    }

    #[test]
    fn parses_a_complete_sse_event_from_one_chunk() {
        let mut buf = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n".to_string();
        let events = drain_sse_events(&mut buf);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].delta.as_ref().unwrap().text.as_deref(), Some("hi"));
        assert!(buf.is_empty());
    }

    #[test]
    fn buffers_an_event_split_across_two_chunks() {
        let mut buf = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_del".to_string();
        let events = drain_sse_events(&mut buf);
        assert!(events.is_empty());
        assert!(!buf.is_empty());

        buf.push_str("ta\",\"text\":\"hi\"}}\n\n");
        let events = drain_sse_events(&mut buf);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].delta.as_ref().unwrap().text.as_deref(), Some("hi"));
    }

    #[test]
    fn stops_on_message_stop() {
        let mut buf = "data: {\"type\":\"message_stop\"}\n\n".to_string();
        let events = drain_sse_events(&mut buf);
        assert_eq!(events[0].kind, "message_stop");
    }
}
