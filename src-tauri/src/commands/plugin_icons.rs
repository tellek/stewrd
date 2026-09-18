// Optional per-plugin icon.png, read from the plugin's own folder and
// returned as a data URL so the frontend can render it without any
// asset-protocol/filesystem-plugin configuration. `dir` comes straight from
// the webview, so it's validated as a single path segment before being
// joined onto the plugins root - mirrors fs.rs's resolve_scoped_path guard.
use crate::commands::icon_util::read_as_data_url;
use crate::commands::path_util::is_valid_dir_segment;
use crate::commands::plugins::resolve_plugins_dir;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize, Default)]
pub struct PluginIconUrls {
    pub png: Option<String>,
}

#[tauri::command]
pub fn get_plugin_icon(app: AppHandle, dir: String) -> Result<PluginIconUrls, String> {
    if !is_valid_dir_segment(&dir) {
        return Err(format!("invalid plugin dir '{dir}'"));
    }
    let plugin_dir = resolve_plugins_dir(&app)?.join(&dir);
    Ok(PluginIconUrls {
        png: read_as_data_url(&plugin_dir.join("icon.png"), "image/png"),
    })
}
