// Category icons live next to the running executable (not bundled at build
// time), so a user can drop new <name>.png / <name>.gif pairs into
// <exe-dir>/assets/category-icons/ - dev (`target/debug`) and a release
// install both "just work" since the folder is resolved relative to
// whatever binary is actually running, not a fixed absolute path.
use crate::commands::icon_util::read_as_data_url;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct CategoryIconFile {
    pub name: String,
    pub png: Option<String>,
    pub gif: Option<String>,
}

pub fn resolve_category_icons_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("could not resolve current exe path: {e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "current exe path has no parent directory".to_string())?;
    let dir = exe_dir.join("assets").join("category-icons");
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[tauri::command]
pub fn list_category_icons(app: AppHandle) -> Result<Vec<CategoryIconFile>, String> {
    let dir = resolve_category_icons_dir(&app)?;
    let read_dir = std::fs::read_dir(&dir).map_err(|e| format!("could not read {}: {e}", dir.display()))?;

    let mut by_name: BTreeMap<String, CategoryIconFile> = BTreeMap::new();
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) else {
            continue;
        };
        if ext != "png" && ext != "gif" {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };

        let file = by_name.entry(stem.to_string()).or_insert_with(|| CategoryIconFile {
            name: stem.to_string(),
            png: None,
            gif: None,
        });
        if ext == "png" {
            file.png = read_as_data_url(&path, "image/png");
        } else {
            file.gif = read_as_data_url(&path, "image/gif");
        }
    }

    Ok(by_name.into_values().collect())
}
