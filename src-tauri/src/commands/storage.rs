// Per-plugin key/value storage, namespaced automatically under the plugin's
// own app-data folder - plugin authors never construct the path themselves.
// Writes are atomic (tmp-file-then-rename), since a plugin's tick loop writing
// on the same file as e.g. Notepad's autosave is a realistic day-one path to a
// torn/corrupted JSON file with a naive overwrite. Plaintext JSON on disk -
// documented as such so plugin authors know not to put secrets in it.
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn storage_path(app: &AppHandle, plugin_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?
        .join("storage");
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir.join(format!("{plugin_id}.json")))
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

#[tauri::command]
pub fn storage_get(app: AppHandle, plugin_id: String, key: String) -> Result<Option<Value>, String> {
    let store = read_store(&storage_path(&app, &plugin_id)?);
    Ok(store.get(&key).cloned())
}

#[tauri::command]
pub fn storage_set(app: AppHandle, plugin_id: String, key: String, value: Value) -> Result<(), String> {
    let path = storage_path(&app, &plugin_id)?;
    let mut store = read_store(&path);
    store.insert(key, value);
    write_store_atomic(&path, &store)
}

#[tauri::command]
pub fn storage_get_all(app: AppHandle, plugin_id: String) -> Result<HashMap<String, Value>, String> {
    Ok(read_store(&storage_path(&app, &plugin_id)?))
}
