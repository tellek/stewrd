// Plugin-facing raw file access, namespaced under the plugin's own app-data
// folder automatically (mirrors storage.rs's atomic-write approach). watchFile
// is deferred - no plugin needs it yet (Milestone 4's build order omits fs
// entirely; readTextFile/writeTextFile are implemented now since they're a
// near-zero-marginal-cost mirror of storage.rs, but watchFile needs genuinely
// new per-file watcher lifecycle infrastructure with no consumer yet).
use super::path_util::path_clean;
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

#[tauri::command]
pub fn fs_read_text_file(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = resolve_scoped_path(&root, &path)?;
    std::fs::read_to_string(&full_path).map_err(|e| format!("failed to read {}: {e}", full_path.display()))
}

/// Reads a binary file from the plugin's namespaced folder and returns it as
/// a `data:` URL, so plugin UI (IconButton/Banner/DropdownImageGrid icons)
/// can reference images without any raw filesystem path leaking into the
/// bundled JS - the plugin build has no loader for image imports, and plugin
/// bundles load from a Blob URL so relative asset paths don't resolve anyway.
#[tauri::command]
pub fn fs_read_data_url(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = resolve_scoped_path(&root, &path)?;
    let bytes =
        std::fs::read(&full_path).map_err(|e| format!("failed to read {}: {e}", full_path.display()))?;
    let mime = match full_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
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

#[derive(serde::Serialize)]
pub struct FsDirEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

/// Lists entries in a directory within the plugin's namespaced folder.
/// Returns an empty list (not an error) when the directory simply doesn't
/// exist yet - `plugin_fs_root` only creates the plugin's root, not
/// subfolders a plugin might organize its own data into, so every caller
/// that lists a not-yet-created subfolder (e.g. before its first write)
/// would otherwise have to special-case a NotFound error. Any other error
/// (permission denied, path is a file, etc.) still propagates as a real
/// error so it isn't silently mistaken for "nothing here".
#[tauri::command]
pub fn fs_list_dir(app: AppHandle, plugin_id: String, path: Option<String>) -> Result<Vec<FsDirEntry>, String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = match &path {
        Some(p) if !p.is_empty() => resolve_scoped_path(&root, p)?,
        _ => root,
    };
    let read_dir = match std::fs::read_dir(&full_path) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("failed to list {}: {e}", full_path.display())),
    };
    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("failed to read entry in {}: {e}", full_path.display()))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry
            .file_type()
            .map_err(|e| format!("failed to stat {}: {e}", name))?
            .is_dir();
        entries.push(FsDirEntry { name, is_dir });
    }
    Ok(entries)
}

/// Returns the absolute path of the plugin's own sandboxed storage folder,
/// so a plugin can hand it to a spawned external process (e.g. as `cwd`)
/// that needs a real filesystem path rather than a path scoped through
/// these commands. Note this does NOT extend the sandbox to that process -
/// it only tells the plugin where its own folder lives on disk.
#[tauri::command]
pub fn fs_get_root_path(app: AppHandle, plugin_id: String) -> Result<String, String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn fs_delete_file(app: AppHandle, plugin_id: String, path: String) -> Result<(), String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let full_path = resolve_scoped_path(&root, &path)?;
    std::fs::remove_file(&full_path).map_err(|e| format!("failed to delete {}: {e}", full_path.display()))
}

#[tauri::command]
pub fn fs_rename_file(app: AppHandle, plugin_id: String, from: String, to: String) -> Result<(), String> {
    let root = plugin_fs_root(&app, &plugin_id)?;
    let from_path = resolve_scoped_path(&root, &from)?;
    let to_path = resolve_scoped_path(&root, &to)?;
    if let Some(parent) = to_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {e}", parent.display()))?;
    }
    std::fs::rename(&from_path, &to_path)
        .map_err(|e| format!("failed to rename {} to {}: {e}", from_path.display(), to_path.display()))
}
