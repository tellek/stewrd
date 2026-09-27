// Stores the Anthropic API key in the OS credential store (Windows
// Credential Manager via the `keyring` crate's windows-native backend), not
// in the plaintext per-plugin storage.rs mechanism. There is deliberately no
// "get" command registered here - the only code that ever reads the key back
// out is ai_anthropic.rs's own request path, so the plaintext key never
// serializes across the Tauri IPC boundary into JS after being set. This is
// an IPC-layer guarantee, not a stronger one: any process running as the same
// Windows user can still read it via CredRead, same as any OS-keyring secret.
use keyring::Entry;

const SERVICE: &str = "stewrd";
const ACCOUNT: &str = "anthropic-api-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

pub(crate) fn read_anthropic_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secrets_set_anthropic_key(key: String) -> Result<(), String> {
    entry()?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secrets_has_anthropic_key() -> Result<bool, String> {
    Ok(read_anthropic_key()?.is_some())
}

#[tauri::command]
pub fn secrets_clear_anthropic_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // These exercise the real windows-native backend (there is no per-test
    // isolation), so they use a distinct account name and clean up after
    // themselves rather than touching SERVICE/ACCOUNT above.
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
}
