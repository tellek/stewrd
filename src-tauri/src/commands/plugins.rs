// Milestone 2b: real plugin discovery + boot-safety mark-before-run.
// Full PluginApi surface (storage/shell/tick/etc.) lands in Milestone 4 - for
// now the loader only needs discovery, source text, and crash-safety marks.
use super::path_util::sanitize_dir_name;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

const SUPPORTED_API_VERSION: &str = "1";
const DISABLED_PLUGINS_FILE: &str = "disabled-plugins.json";
const BOOT_MARKS_FILE: &str = "boot-marks.json";
const SAFE_MODE_FILE: &str = "SAFE_MODE";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
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
    },
    #[serde(rename = "error")]
    Error { dir: String, message: String },
}

/// Resolution order: `STEWRD_PLUGINS` env var (dev convenience) -> a
/// `plugins` folder next to the running executable (portable install) -> the
/// per-user app-data plugins directory, only as a last-resort fallback if the
/// exe's own folder isn't writable (e.g. a Program Files install). The
/// read-only bundled-plugins tier is a packaging concern deferred to
/// Milestone 7.
pub fn resolve_plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("STEWRD_PLUGINS") {
        return Ok(PathBuf::from(dir));
    }
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("could not resolve current exe path: {e}"))?
        .parent()
        .ok_or_else(|| "exe path has no parent directory".to_string())?
        .to_path_buf();
    let plugins_dir = exe_dir.join("plugins");
    // A hard error here would propagate out of `setup()` via `?` and the app
    // would never open a window at all - so treat an unwritable exe dir
    // (Program Files, etc.) as a fallback to the old AppData location instead
    // of a fatal error.
    if std::fs::create_dir_all(&plugins_dir).is_ok() {
        return Ok(plugins_dir);
    }
    let fallback = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?
        .join("plugins");
    std::fs::create_dir_all(&fallback)
        .map_err(|e| format!("could not create {} or {}: {e}", plugins_dir.display(), fallback.display()))?;
    Ok(fallback)
}

/// One-time best-effort copy of any plugins already installed under the old
/// AppData plugins location into the new portable `<exe-dir>/plugins`
/// location, so an existing install doesn't silently lose its plugins the
/// first time it launches after this change. Never moves/deletes the old
/// copy, and never errors the app out - failures are logged only.
pub fn migrate_legacy_appdata_plugins(app: &AppHandle, plugins_dir: &Path) {
    let has_entries = std::fs::read_dir(plugins_dir).map(|mut rd| rd.next().is_some()).unwrap_or(false);
    if has_entries {
        return; // new location already has something - nothing to do
    }
    let Ok(app_data) = app.path().app_data_dir() else { return };
    let legacy_dir = app_data.join("plugins");
    if legacy_dir == *plugins_dir {
        return; // fallback tier resolved to the same folder - no migration needed
    }
    let Ok(read_dir) = std::fs::read_dir(&legacy_dir) else { return };
    let mut migrated = 0;
    for entry in read_dir.flatten() {
        let src = entry.path();
        if !src.is_dir() {
            continue;
        }
        let Some(name) = src.file_name() else { continue };
        let dest = plugins_dir.join(name);
        if copy_dir_recursive(&src, &dest).is_ok() {
            migrated += 1;
        } else {
            eprintln!("[stewrd] warning: failed to migrate plugin folder {}", src.display());
        }
    }
    if migrated > 0 {
        eprintln!(
            "[stewrd] migrated {migrated} plugin folder(s) from {} to {}",
            legacy_dir.display(),
            plugins_dir.display()
        );
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let entry_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &dest_path)?;
        } else {
            std::fs::copy(&entry_path, &dest_path)?;
        }
    }
    Ok(())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
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
    let dir = app_data_dir(&app)?;
    Ok(dir.join(SAFE_MODE_FILE).exists())
}

/// Called once at startup, before any plugin is loaded. Any plugin still
/// marked "attempting" from the previous run crashed/hung on its very first
/// load (mark-before-run is written before `import()`, not just before
/// `activate()`) - such plugins are auto-disabled (N=1) and the stale marks
/// are cleared so this run starts fresh.
#[tauri::command]
pub fn reconcile_boot_marks(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = app_data_dir(&app)?;
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
    let dir = app_data_dir(&app)?;
    let marks_path = dir.join(BOOT_MARKS_FILE);
    let mut marks = read_id_set(&marks_path);
    marks.insert(plugin_id);
    write_id_set(&marks_path, &marks)
}

#[tauri::command]
pub fn clear_plugin_attempt(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    let marks_path = dir.join(BOOT_MARKS_FILE);
    let mut marks = read_id_set(&marks_path);
    marks.remove(&plugin_id);
    write_id_set(&marks_path, &marks)
}

/// `dir` is only used to notify the watcher-driven hot-reload path below -
/// the actual enabled/disabled state is still keyed by `plugin_id`, same as
/// before. Without the emit, toggling this from the UI updated
/// `disabled-plugins.json` (under `app_data_dir()`, which nothing watches)
/// but left the already-loaded plugin instance running untouched until the
/// next full app restart.
#[tauri::command]
pub fn set_plugin_disabled(app: AppHandle, plugin_id: String, dir: String, disabled: bool) -> Result<(), String> {
    let app_data = app_data_dir(&app)?;
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

/// Reads the plugin's optional `settings.json` and returns its `"category"`
/// key if present and a string. A missing `settings.json` (or one present but
/// with no `"category"` key) falls back to the `plugin.json` manifest's own
/// (now-optional) `category` field, for backward compatibility with plugins
/// installed before `settings.json` became the primary source; only if
/// neither exists does this resolve to `""` (the frontend's `resolveCategory`
/// already treats any non-matching string as "Other" - no special-casing
/// needed here). A malformed `settings.json` is logged and falls back to the
/// manifest the same way a missing file does - matches this module's "never
/// brick discovery over corrupt state" philosophy.
fn read_plugin_category(plugin_dir: &Path, manifest_category: &Option<String>) -> String {
    let path = plugin_dir.join("settings.json");
    let from_file = match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(value) => value.get("category").and_then(|v| v.as_str()).map(|s| s.to_string()),
            Err(e) => {
                eprintln!(
                    "[stewrd] warning: {} is malformed ({e}); falling back to plugin.json's category if any",
                    path.display()
                );
                None
            }
        },
        Err(_) => None,
    };
    from_file.or_else(|| manifest_category.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<PluginDiscoveryEntry>, String> {
    let plugins_dir = resolve_plugins_dir(&app)?;
    let disabled_path = app_data_dir(&app)?.join(DISABLED_PLUGINS_FILE);
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
        let category = read_plugin_category(&path, &manifest.category);
        entries.push(PluginDiscoveryEntry::Ok {
            dir: dir_name,
            manifest,
            source,
            disabled,
            category,
        });
    }

    Ok(entries)
}
