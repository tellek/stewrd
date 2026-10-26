// Stores every AI provider API key in the OS credential store (Windows
// Credential Manager, macOS Keychain, or Linux Secret Service via the
// `keyring` crate), never in the plaintext per-plugin storage.rs mechanism and
// never in a fallback file. There is deliberately no "get" command registered
// here - the only code that reads a key back out is the Rust request paths
// (ai_anthropic.rs, ai_openai_compat.rs), so a key never serializes across the
// Tauri IPC boundary into JS after being set. This is an IPC-layer guarantee,
// not a stronger one: any process running as the same OS user can still read
// it from the credential store, same as any OS-keyring secret.
//
// The custom (bring-your-own endpoint) provider stores its base URL together
// with its key as one JSON blob, replaced atomically. A plugin can call any
// command with raw invoke(), so there is intentionally no "set URL only"
// command that could redirect an existing key to another host.
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "stewrd";

/// Provider ids that may hold a key. Must match src/host/api/aiProviders.ts
/// (a vitest asserts the two lists agree).
pub(crate) const KEY_PROVIDERS: &[&str] = &["claude", "openai", "gemini", "grok", "custom"];

fn account(provider: &str) -> Result<String, String> {
    if !KEY_PROVIDERS.contains(&provider) {
        return Err(format!("unknown AI provider: {provider}"));
    }
    // Claude keeps the account name used before multi-provider support so
    // keys saved by older versions keep working.
    Ok(match provider {
        "claude" => "anthropic-api-key".to_string(),
        other => format!("{other}-api-key"),
    })
}

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &account(provider)?).map_err(|e| e.to_string())
}

fn read_raw(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize, Deserialize)]
struct CustomBlob {
    #[serde(rename = "baseUrl")]
    base_url: String,
    key: String,
}

fn read_custom_blob() -> Result<Option<CustomBlob>, String> {
    match read_raw("custom")? {
        Some(raw) => serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// The key for a built-in provider, or None when unset. Not for "custom" -
/// use read_custom_endpoint, which also returns the base URL.
pub(crate) fn read_key(provider: &str) -> Result<Option<String>, String> {
    if provider == "custom" {
        return Err("use read_custom_endpoint for the custom provider".to_string());
    }
    read_raw(provider)
}

/// (base_url, optional key) for the custom provider. The key is None when the
/// endpoint needs none (e.g. a local Ollama server).
pub(crate) fn read_custom_endpoint() -> Result<Option<(String, Option<String>)>, String> {
    Ok(read_custom_blob()?.map(|b| (b.base_url, if b.key.is_empty() { None } else { Some(b.key) })))
}

/// Only https endpoints, or plain http to the local machine (Ollama, LM Studio).
fn validate_base_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    let local = ["http://localhost", "http://127.0.0.1", "http://[::1]"];
    if url.starts_with("https://") || local.iter().any(|p| url.starts_with(p)) {
        Ok(())
    } else {
        Err("Base URL must start with https:// (or http://localhost for a local server)".to_string())
    }
}

#[tauri::command]
pub fn secrets_set_key(provider: String, key: String) -> Result<(), String> {
    if provider == "custom" {
        return Err("use secrets_set_custom for the custom provider".to_string());
    }
    entry(&provider)?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secrets_set_custom(base_url: String, key: String) -> Result<(), String> {
    validate_base_url(&base_url)?;
    let blob = CustomBlob { base_url: base_url.trim().trim_end_matches('/').to_string(), key };
    let raw = serde_json::to_string(&blob).map_err(|e| e.to_string())?;
    entry("custom")?.set_password(&raw).map_err(|e| e.to_string())
}

/// For "custom", true when an endpoint is saved (a keyless local server counts
/// as configured); for the others, true when a key is saved.
#[tauri::command]
pub fn secrets_has_key(provider: String) -> Result<bool, String> {
    if provider == "custom" {
        return Ok(read_custom_blob()?.is_some());
    }
    Ok(read_raw(&provider)?.is_some())
}

/// Non-secret display value for the custom provider's settings panel.
#[tauri::command]
pub fn secrets_get_custom_base_url() -> Result<Option<String>, String> {
    Ok(read_custom_blob()?.map(|b| b.base_url))
}

#[tauri::command]
pub fn secrets_clear_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // These exercise the real OS backend (there is no per-test isolation), so
    // they use a distinct account name and clean up after themselves rather
    // than touching the real provider accounts.
    fn test_entry() -> Entry {
        Entry::new(SERVICE, "test-anthropic-api-key").unwrap()
    }

    #[test]
    fn round_trips_a_key_through_set_then_get() {
        let entry = test_entry();
        entry.set_password("sk-test-123").unwrap();
        assert_eq!(entry.get_password().unwrap(), "sk-test-123");
        entry.delete_credential().unwrap();
    }

    #[test]
    fn reports_no_entry_as_missing_rather_than_erroring() {
        let entry = test_entry();
        let _ = entry.delete_credential();
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }

    #[test]
    fn claude_keeps_the_legacy_account_name() {
        assert_eq!(account("claude").unwrap(), "anthropic-api-key");
        assert_eq!(account("openai").unwrap(), "openai-api-key");
    }

    #[test]
    fn rejects_unknown_providers() {
        assert!(account("evil-provider").is_err());
        assert!(secrets_set_key("../x".to_string(), "k".to_string()).is_err());
    }

    #[test]
    fn custom_key_cannot_be_set_through_the_plain_command() {
        assert!(secrets_set_key("custom".to_string(), "k".to_string()).is_err());
        assert!(read_key("custom").is_err());
    }

    #[test]
    fn base_url_must_be_https_or_local_http() {
        assert!(validate_base_url("https://api.deepseek.com").is_ok());
        assert!(validate_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_base_url("http://127.0.0.1:1234/v1").is_ok());
        assert!(validate_base_url("http://attacker.example").is_err());
        assert!(validate_base_url("ftp://x").is_err());
    }

    #[test]
    fn custom_blob_round_trips_and_empty_key_means_keyless() {
        let raw = serde_json::to_string(&CustomBlob { base_url: "http://localhost:11434/v1".into(), key: String::new() }).unwrap();
        let blob: CustomBlob = serde_json::from_str(&raw).unwrap();
        assert_eq!(blob.base_url, "http://localhost:11434/v1");
        assert!(blob.key.is_empty());
    }
}
