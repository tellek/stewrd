// Milestone 2a transport spike: read a hand-written plain .js module as text so the
// frontend can wrap it in a Blob and import() it. Superseded by the real plugin
// discovery/read commands in Milestone 2b — kept isolated here so it's obvious this
// is throwaway validation code, not the production loader.
use std::path::PathBuf;

#[tauri::command]
pub fn spike_read_plugin_file(relative_path: String) -> Result<String, String> {
    // CARGO_MANIFEST_DIR is src-tauri/ at compile time; repo root is one level up.
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("could not resolve repo root")?
        .to_path_buf();
    let path = repo_root.join(relative_path);
    std::fs::read_to_string(&path).map_err(|e| format!("failed to read {}: {}", path.display(), e))
}

#[tauri::command]
pub fn spike_report(result: String) {
    println!("[SPIKE] {}", result);
}
