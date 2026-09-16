// Rolling persistent log file in app-data. Logging is never automatic for
// shell/process output (may contain secrets) - only what a plugin/host
// explicitly logs lands here. The frontend builds the formatted line (one
// JSON object per line); this command just appends it, size-capped with a
// single-generation rotation so the file can't grow unbounded.
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn append_log_line(app: AppHandle, line: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let path = dir.join("stewrd.log");

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = std::fs::rename(&path, dir.join("stewrd.log.old"));
        }
    }

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("could not open {}: {e}", path.display()))?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}
