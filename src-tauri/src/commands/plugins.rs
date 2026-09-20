// Milestone 2b: real plugin discovery + boot-safety mark-before-run.
// Full PluginApi surface (storage/shell/tick/etc.) lands in Milestone 4 - for
// now the loader only needs discovery, source text, and crash-safety marks.
use super::path_util::sanitize_dir_name;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const SUPPORTED_API_VERSION: &str = "1";
const DISABLED_PLUGINS_FILE: &str = "disabled-plugins.json";
const BOOT_MARKS_FILE: &str = "boot-marks.json";
const SAFE_MODE_FILE: &str = "SAFE_MODE";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    /// Legacy version source, kept optional rather than removed - same
    /// backward-compat reasoning as `category` below: a plugin installed
    /// before `settings.json` became the primary source still has this in
    /// its `plugin.json` and nothing else.
    #[serde(default)]
    pub version: Option<String>,
    /// Legacy category source, kept optional rather than removed: plugins
    /// installed before `settings.json` became the primary source (see
    /// `read_plugin_category` below) still have this in their `plugin.json`
    /// and nothing else - dropping it here would silently regroup every
    /// already-installed plugin into "Other" the moment this ships.
    #[serde(default)]
    pub category: Option<String>,
    pub icon: String,
    pub entry: String,
    pub description: String,
    #[serde(rename = "apiVersion")]
    pub api_version: String,
    #[serde(default)]
    pub background: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum PluginDiscoveryEntry {
    #[serde(rename = "ok")]
    Ok {
        dir: String,
        manifest: PluginManifest,
        source: String,
        disabled: bool,
        category: String,
        version: String,
    },
    #[serde(rename = "error")]
    Error { dir: String, message: String },
}

/// Resolution order: `STEWRD_PLUGINS` env var (dev convenience) -> a
/// `plugins` folder next to the running executable. This app is portable by
/// design - there is no app-data fallback tier.
pub fn resolve_plugins_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("STEWRD_PLUGINS") {
        return Ok(PathBuf::from(dir));
    }
    let plugins_dir = super::path_util::exe_dir()?.join("plugins");
    std::fs::create_dir_all(&plugins_dir).map_err(|e| format!("could not create {}: {e}", plugins_dir.display()))?;
    Ok(plugins_dir)
}

fn app_state_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    let dir = super::path_util::exe_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Corrupt state must never brick boot: any read/parse failure here logs a
/// warning and returns an empty set instead of erroring.
fn read_id_set(path: &Path) -> HashSet<String> {
    match std::fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Vec<String>>(&text) {
            Ok(ids) => ids.into_iter().collect(),
            Err(e) => {
                eprintln!(
                    "[stewrd] warning: {} is corrupt ({e}); disabling nothing",
                    path.display()
                );
                HashSet::new()
            }
        },
        Err(_) => HashSet::new(),
    }
}

fn write_id_set(path: &Path, ids: &HashSet<String>) -> Result<(), String> {
    let list: Vec<&String> = ids.iter().collect();
    let json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("could not write {}: {e}", path.display()))
}

#[tauri::command]
pub fn is_safe_mode(app: AppHandle) -> Result<bool, String> {
    let dir = app_state_dir(&app)?;
    Ok(dir.join(SAFE_MODE_FILE).exists())
}

/// Called once at startup, before any plugin is loaded. Any plugin still
/// marked "attempting" from the previous run crashed/hung on its very first
/// load (mark-before-run is written before `import()`, not just before
/// `activate()`) - such plugins are auto-disabled (N=1) and the stale marks
/// are cleared so this run starts fresh.
#[tauri::command]
pub fn reconcile_boot_marks(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = app_state_dir(&app)?;
    let marks_path = dir.join(BOOT_MARKS_FILE);
    let stale = read_id_set(&marks_path);

    if !stale.is_empty() {
        let disabled_path = dir.join(DISABLED_PLUGINS_FILE);
        let mut disabled = read_id_set(&disabled_path);
        for id in &stale {
            eprintln!("[stewrd] auto-disabling plugin '{id}': crashed/hung on previous load");
            disabled.insert(id.clone());
        }
        write_id_set(&disabled_path, &disabled)?;
    }

    write_id_set(&marks_path, &HashSet::new())?;
    Ok(stale.into_iter().collect())
}

#[tauri::command]
pub fn mark_plugin_attempt(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let dir = app_state_dir(&app)?;
    let marks_path = dir.join(BOOT_MARKS_FILE);
    let mut marks = read_id_set(&marks_path);
    marks.insert(plugin_id);
    write_id_set(&marks_path, &marks)
}

#[tauri::command]
pub fn clear_plugin_attempt(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let dir = app_state_dir(&app)?;
    let marks_path = dir.join(BOOT_MARKS_FILE);
    let mut marks = read_id_set(&marks_path);
    marks.remove(&plugin_id);
    write_id_set(&marks_path, &marks)
}

/// `dir` is only used to notify the watcher-driven hot-reload path below -
/// the actual enabled/disabled state is still keyed by `plugin_id`, same as
/// before. Without the emit, toggling this from the UI updated
/// `disabled-plugins.json` (under `app_state_dir()`, which nothing watches)
/// but left the already-loaded plugin instance running untouched until the
/// next full app restart.
#[tauri::command]
pub fn set_plugin_disabled(app: AppHandle, plugin_id: String, dir: String, disabled: bool) -> Result<(), String> {
    let app_data = app_state_dir(&app)?;
    let disabled_path = app_data.join(DISABLED_PLUGINS_FILE);
    let mut ids = read_id_set(&disabled_path);
    if disabled {
        ids.insert(plugin_id);
    } else {
        ids.remove(&plugin_id);
    }
    write_id_set(&disabled_path, &ids)?;
    let _ = app.emit("plugin-changed", dir);
    Ok(())
}

/// Deletes an installed plugin's folder entirely. `dir` is validated through
/// the strict sanitizer (not just `is_valid_dir_segment`) and the resolved
/// path's parent is asserted to be the plugins dir itself before deleting
/// anything, since this drives a recursive delete off webview-supplied input.
/// The existing recursive plugin-folder watcher picks up the removal and
/// `usePluginRegistry`'s hot-remove path unloads it - no explicit event
/// needed here.
#[tauri::command]
pub fn remove_plugin(app: AppHandle, dir: String) -> Result<(), String> {
    let Some(safe_dir) = sanitize_dir_name(&dir) else {
        return Err(format!("invalid plugin directory name '{dir}'"));
    };
    let plugins_dir = resolve_plugins_dir(&app)?;
    let target = plugins_dir.join(&safe_dir);
    if target.parent() != Some(plugins_dir.as_path()) {
        return Err(format!("invalid plugin directory name '{dir}'"));
    }
    if !target.exists() {
        return Err(format!("plugin folder '{safe_dir}' does not exist"));
    }
    std::fs::remove_dir_all(&target).map_err(|e| format!("failed to remove {}: {e}", target.display()))
}

/// Parses the plugin's optional `settings.json` once as a bare JSON value, so
/// both `category` and `version` (and anything else added later) can be
/// pulled from a single read/parse instead of duplicating it per field.
/// Missing file -> `None`. Malformed file -> logs a warning and also `None` -
/// callers fall back to their `plugin.json` manifest field in either case,
/// matching this module's "never brick discovery over corrupt state"
/// philosophy.
fn read_plugin_settings_value(plugin_dir: &Path) -> Option<serde_json::Value> {
    let path = plugin_dir.join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(value) => Some(value),
            Err(e) => {
                eprintln!(
                    "[stewrd] warning: {} is malformed ({e}); falling back to plugin.json for category/version",
                    path.display()
                );
                None
            }
        },
        Err(_) => None,
    }
}

/// Resolves one string field from `settings.json` (parsed once by
/// `read_plugin_settings_value`), falling back to the equivalent legacy
/// `plugin.json` manifest field, falling back to `""` if neither exists.
/// Used for both `category` (the frontend's `resolveCategory` already treats
/// any non-matching string as "Other", so `""` needs no special-casing) and
/// `version` (purely informational, displayed as-is).
fn resolve_settings_string(settings_value: &Option<serde_json::Value>, key: &str, manifest_fallback: &Option<String>) -> String {
    let from_file = settings_value.as_ref().and_then(|v| v.get(key)).and_then(|v| v.as_str()).map(|s| s.to_string());
    from_file.or_else(|| manifest_fallback.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<PluginDiscoveryEntry>, String> {
    let plugins_dir = resolve_plugins_dir(&app)?;
    let disabled_path = app_state_dir(&app)?.join(DISABLED_PLUGINS_FILE);
    let disabled_ids = read_id_set(&disabled_path);

    let mut entries = Vec::new();
    let read_dir = match std::fs::read_dir(&plugins_dir) {
        Ok(rd) => rd,
        Err(e) => {
            return Err(format!(
                "could not read plugins dir {}: {e}",
                plugins_dir.display()
            ))
        }
    };

    for dir_entry in read_dir.flatten() {
        let path = dir_entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let manifest_path = path.join("plugin.json");
        if !manifest_path.exists() {
            continue; // not a plugin folder
        }

        let manifest_text = match std::fs::read_to_string(&manifest_path) {
            Ok(t) => t,
            Err(e) => {
                entries.push(PluginDiscoveryEntry::Error {
                    dir: dir_name,
                    message: format!("failed to read plugin.json: {e}"),
                });
                continue;
            }
        };

        let manifest: PluginManifest = match serde_json::from_str(&manifest_text) {
            Ok(m) => m,
            Err(e) => {
                entries.push(PluginDiscoveryEntry::Error {
                    dir: dir_name,
                    message: format!("malformed plugin.json: {e}"),
                });
                continue;
            }
        };

        if manifest.api_version != SUPPORTED_API_VERSION {
            entries.push(PluginDiscoveryEntry::Error {
                dir: dir_name,
                message: format!(
                    "unsupported apiVersion '{}' (host supports '{}')",
                    manifest.api_version, SUPPORTED_API_VERSION
                ),
            });
            continue;
        }

        let entry_path = path.join(&manifest.entry);
        let source = match std::fs::read_to_string(&entry_path) {
            Ok(s) => s,
            Err(e) => {
                entries.push(PluginDiscoveryEntry::Error {
                    dir: dir_name,
                    message: format!("missing built output {}: {e}", entry_path.display()),
                });
                continue;
            }
        };

        let disabled = disabled_ids.contains(&manifest.id);
        let settings_value = read_plugin_settings_value(&path);
        let category = resolve_settings_string(&settings_value, "category", &manifest.category);
        let version = resolve_settings_string(&settings_value, "version", &manifest.version);
        entries.push(PluginDiscoveryEntry::Ok {
            dir: dir_name,
            manifest,
            source,
            disabled,
            category,
            version,
        });
    }

    Ok(entries)
}
