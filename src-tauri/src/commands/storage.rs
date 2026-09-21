// Per-plugin key/value storage, namespaced automatically under the plugin's
// own folder inside the plugins directory - plugin authors never construct
// the path themselves. Writes are atomic (tmp-file-then-rename), since a
// plugin's tick loop writing on the same file as e.g. Notepad's autosave is a
// realistic day-one path to a torn/corrupted JSON file with a naive
// overwrite. Plaintext JSON on disk - documented as such so plugin authors
// know not to put secrets in it.
use super::plugins::resolve_plugins_dir;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

/// storage_set does read-whole-file, mutate one key, write-whole-file - two
/// concurrent storage_set calls for the *same* plugin_id (e.g. several
/// appStore actions each firing their own fire-and-forget saveHostSettings()
/// close together, which is common at startup as multiple plugins register
/// state) can otherwise interleave and lose one of the writes: both read the
/// file before either has written back. This lock serializes every
/// storage_set for a plugin_id so each read-modify-write is atomic relative
/// to the others. A single global lock (not per-plugin_id) is fine - writes
/// are rare, brief, and calling it a bottleneck would be premature.
fn write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn storage_path(app: &AppHandle, plugin_id: &str) -> Result<PathBuf, String> {
    let dir = resolve_plugins_dir(app)?.join(plugin_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir.join("storage.json"))
}

fn read_store(path: &PathBuf) -> HashMap<String, Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_store_atomic(path: &PathBuf, data: &HashMap<String, Value>) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, json).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("could not finalize {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_a_value_through_write_then_read() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("storage.json");
        let mut data = HashMap::new();
        data.insert("key".to_string(), json!("value"));
        write_store_atomic(&path, &data).unwrap();

        let read = read_store(&path);
        assert_eq!(read.get("key"), Some(&json!("value")));
    }

    #[test]
    fn returns_an_empty_map_for_corrupt_non_json_content() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("storage.json");
        std::fs::write(&path, "not json at all {{{").unwrap();

        let read = read_store(&path);
        assert!(read.is_empty());
    }

    #[test]
    fn returns_an_empty_map_for_a_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("does-not-exist.json");

        let read = read_store(&path);
        assert!(read.is_empty());
    }

    #[test]
    fn leaves_no_leftover_tmp_file_after_a_successful_write() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("storage.json");
        let data = HashMap::new();
        write_store_atomic(&path, &data).unwrap();

        assert!(!tmp.path().join("storage.json.tmp").exists());
    }
}

#[tauri::command]
pub fn storage_get(app: AppHandle, plugin_id: String, key: String) -> Result<Option<Value>, String> {
    let store = read_store(&storage_path(&app, &plugin_id)?);
    Ok(store.get(&key).cloned())
}

#[tauri::command]
pub fn storage_set(app: AppHandle, plugin_id: String, key: String, value: Value) -> Result<(), String> {
    let _guard = write_lock().lock().map_err(|e| e.to_string())?;
    let path = storage_path(&app, &plugin_id)?;
    let mut store = read_store(&path);
    store.insert(key, value);
    write_store_atomic(&path, &store)
}

#[tauri::command]
pub fn storage_get_all(app: AppHandle, plugin_id: String) -> Result<HashMap<String, Value>, String> {
    Ok(read_store(&storage_path(&app, &plugin_id)?))
}
