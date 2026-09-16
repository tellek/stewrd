// Plugin-facing raw file access, namespaced under the plugin's own app-data
// folder automatically (mirrors storage.rs's atomic-write approach). watchFile
// is deferred - no plugin needs it yet (Milestone 4's build order omits fs
// entirely; readTextFile/writeTextFile are implemented now since they're a
// near-zero-marginal-cost mirror of storage.rs, but watchFile needs genuinely
// new per-file watcher lifecycle infrastructure with no consumer yet).
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn plugin_fs_root(app: &AppHandle, plugin_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?
        .join("plugin-fs")
        .join(plugin_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Rejects any path that would escape the plugin's own namespaced folder
/// (e.g. via `..` segments) - fully trusted plugins still shouldn't be able
/// to accidentally clobber another plugin's files through a path bug.
fn resolve_scoped_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let joined = root.join(relative);
    let normalized = path_clean(&joined);
    if !normalized.starts_with(root) {
        return Err(format!("path '{relative}' escapes the plugin's storage scope"));
    }
    Ok(normalized)
}

fn path_clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

#[tauri::command]
pub fn fs_read_text_file(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = resolve_scoped_path(&root, &path)?;
    std::fs::read_to_string(&full_path).map_err(|e| format!("failed to read {}: {e}", full_path.display()))
}

#[tauri::command]
pub fn fs_write_text_file(app: AppHandle, plugin_id: String, path: String, contents: String) -> Result<(), String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = resolve_scoped_path(&root, &path)?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {e}", parent.display()))?;
    }
    let tmp = full_path.with_extension("tmp");
    std::fs::write(&tmp, &contents).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &full_path).map_err(|e| format!("could not finalize {}: {e}", full_path.display()))
}
