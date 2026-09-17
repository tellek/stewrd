// Optional per-plugin icon.png / icon.gif, read from the plugin's own
// folder and returned as data URLs so the frontend can render them without
// any asset-protocol/filesystem-plugin configuration. `dir` comes straight
// from the webview, so it's validated as a single path segment before being
// joined onto the plugins root - mirrors fs.rs's resolve_scoped_path guard.
use crate::commands::plugins::resolve_plugins_dir;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Serialize, Default)]
pub struct PluginIconUrls {
    pub png: Option<String>,
    pub gif: Option<String>,
}

fn is_valid_dir_segment(dir: &str) -> bool {
    !dir.is_empty() && dir != "." && dir != ".." && !dir.contains('/') && !dir.contains('\\')
}

fn read_as_data_url(path: &Path, mime: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn get_plugin_icon(app: AppHandle, dir: String) -> Result<PluginIconUrls, String> {
    if !is_valid_dir_segment(&dir) {
        return Err(format!("invalid plugin dir '{dir}'"));
    }
    let plugin_dir = resolve_plugins_dir(&app)?.join(&dir);
    Ok(PluginIconUrls {
        png: read_as_data_url(&plugin_dir.join("icon.png"), "image/png"),
        gif: read_as_data_url(&plugin_dir.join("icon.gif"), "image/gif"),
    })
}
