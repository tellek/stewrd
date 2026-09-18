// Backs the Settings > Plugins "Configure" button: reads/writes a plugin's
// own settings.json directly as raw text, mirroring how the example
// claude-settings-editor plugin edits ~/.claude/settings.json (JSON-validated
// before it ever touches disk). No schema/form generation here - settings.json
// is just the plugin's config; the host only ever interprets its "category"
// key (see plugins.rs::read_plugin_category), everything else is opaque to it.
use super::path_util::sanitize_dir_name;
use super::plugins::resolve_plugins_dir;
use tauri::AppHandle;

const STARTER_SETTINGS_JSON: &str = "{\n  \"category\": \"\"\n}\n";

fn resolve_settings_path(app: &AppHandle, dir: &str) -> Result<std::path::PathBuf, String> {
    let Some(safe_dir) = sanitize_dir_name(dir) else {
        return Err(format!("invalid plugin directory name '{dir}'"));
    };
    let plugins_dir = resolve_plugins_dir(app)?;
    let target = plugins_dir.join(&safe_dir);
    if target.parent() != Some(plugins_dir.as_path()) {
        return Err(format!("invalid plugin directory name '{dir}'"));
    }
    Ok(target.join("settings.json"))
}

/// Returns the starter object only when the file genuinely doesn't exist yet
/// - any other read error (locked file, permissions, etc.) propagates as a
/// real error instead of being folded into "no file yet", since silently
/// treating those the same way would let a later Save atomically overwrite a
/// file that actually has content the host just failed to read.
#[tauri::command]
pub fn read_plugin_settings_file(app: AppHandle, dir: String) -> Result<String, String> {
    let path = resolve_settings_path(&app, &dir)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(STARTER_SETTINGS_JSON.to_string()),
        Err(e) => Err(format!("failed to read {}: {e}", path.display())),
    }
}

/// Validates `contents` is well-formed JSON before writing - defense in
/// depth on top of the frontend's own `JSON.parse` check, so a bug or a
/// non-browser caller can't write invalid JSON into a file discovery reads.
/// No explicit `plugin-changed` emit here: this write lands inside
/// `resolve_plugins_dir()`'s already-recursively-watched tree, so the
/// existing fs watcher (`commands/watcher.rs`) picks it up on its own, same
/// as any other in-place plugin file edit.
#[tauri::command]
pub fn write_plugin_settings_file(app: AppHandle, dir: String, contents: String) -> Result<(), String> {
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&contents) {
        return Err(format!("not valid JSON: {e}"));
    }
    let path = resolve_settings_path(&app, &dir)?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &contents).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("could not finalize {}: {e}", path.display()))
}
