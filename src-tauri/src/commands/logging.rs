// Rolling persistent log file next to the running executable. Two things write to it: explicit
// host/plugin log calls via append_log_line (JS builds the line), and the
// commands in `logged.rs` + the panic hook in lib.rs (Rust builds the line
// itself, via log_command_error / log_line_from_parts) - both paths funnel
// through append_log_line_internal so the size-cap/rotation logic lives in
// one place. Lines are always built with serde_json::to_string, never
// format!/string interpolation - real error/panic text routinely contains
// quotes and newlines that would otherwise produce invalid or multi-line
// JSON, breaking the frontend's line-by-line JSON.parse on hydration.
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

fn log_path(log_dir: &Path) -> PathBuf {
    log_dir.join("stewrd.log")
}

pub fn append_log_line_internal(log_dir: &Path, line: &str) -> Result<(), String> {
    std::fs::create_dir_all(log_dir)
        .map_err(|e| format!("could not create {}: {e}", log_dir.display()))?;
    let path = log_path(log_dir);

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = std::fs::rename(&path, log_dir.join("stewrd.log.old"));
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

#[tauri::command]
pub fn append_log_line(_app: AppHandle, line: String) -> Result<(), String> {
    let dir = super::path_util::exe_dir()?;
    append_log_line_internal(&dir, &line)
}

/// Builds one JSON log line in the same shape the frontend uses
/// (`{ts, level, pluginId, message}`) from Rust-originated text (a wrapped
/// command's `Err`, or a panic payload).
pub fn build_log_line(level: &str, plugin_id: Option<&str>, message: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    json!({ "ts": ts, "level": level, "pluginId": plugin_id, "message": message }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_message_with_a_quote_and_a_newline_as_a_single_line() {
        let line = build_log_line("error", None, "bad \"input\"\nsecond line");
        assert!(!line.contains('\n'));
        let parsed: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["message"], "bad \"input\"\nsecond line");
    }

    #[test]
    fn serializes_a_none_plugin_id_as_json_null() {
        let line = build_log_line("info", None, "hello");
        let parsed: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert!(parsed["pluginId"].is_null());
    }

    #[test]
    fn creates_the_target_dir_if_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let log_dir = tmp.path().join("nested").join("logs");
        assert!(!log_dir.exists());
        append_log_line_internal(&log_dir, "line one").unwrap();
        assert!(log_dir.join("stewrd.log").exists());
    }

    #[test]
    fn appends_rather_than_truncates() {
        let tmp = tempfile::tempdir().unwrap();
        append_log_line_internal(tmp.path(), "line one").unwrap();
        append_log_line_internal(tmp.path(), "line two").unwrap();
        let contents = std::fs::read_to_string(tmp.path().join("stewrd.log")).unwrap();
        assert!(contents.contains("line one"));
        assert!(contents.contains("line two"));
    }

    #[test]
    fn rotates_to_stewrd_log_old_once_the_file_exceeds_max_log_bytes() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("stewrd.log");
        // Pre-create a file already over MAX_LOG_BYTES so the next append
        // triggers rotation without actually writing 2MB+ of lines.
        std::fs::write(&path, vec![b'x'; (MAX_LOG_BYTES + 1) as usize]).unwrap();

        append_log_line_internal(tmp.path(), "fresh line").unwrap();

        let old_path = tmp.path().join("stewrd.log.old");
        assert!(old_path.exists());
        let old_len = std::fs::metadata(&old_path).unwrap().len();
        assert!(old_len > MAX_LOG_BYTES);

        let fresh = std::fs::read_to_string(&path).unwrap();
        assert_eq!(fresh.trim(), "fresh line");
    }
}

/// Appends a Rust-originated error/panic line to the log file and, if an
/// AppHandle is available, pushes it live to a running frontend via the
/// `log-line` event - the same event used for both wrapped-command errors
/// (see `logged.rs`) and Rust panics (see lib.rs's panic hook), so the
/// frontend only ever needs one listener for backend-originated log lines.
pub fn log_line_to_disk_and_ui(app: &AppHandle, level: &str, plugin_id: Option<&str>, message: &str) {
    let line = build_log_line(level, plugin_id, message);
    if let Ok(dir) = super::path_util::exe_dir() {
        let _ = append_log_line_internal(&dir, &line);
    }
    let _ = app.emit("log-line", line);
}

/// Called from the thin wrapper commands in `logged.rs` on any `Err` from a
/// higher-risk command (fs/storage/shell/plugin install) - never called from
/// inside the command's own implementation, so the command's own file never
/// needs to know logging exists.
pub fn log_command_error(app: &AppHandle, command: &str, err: &str) {
    log_line_to_disk_and_ui(app, "error", None, &format!("{command}: {err}"));
}

/// Reads only the tail of `stewrd.log` (never `stewrd.log.old` - avoids
/// confusing doubled history across a rotation boundary, and avoids shipping
/// up to 2MB+ over IPC just to truncate it into the frontend's ring buffer).
#[tauri::command]
pub fn read_log_lines(_app: AppHandle, max_lines: usize) -> Result<Vec<String>, String> {
    let dir = super::path_util::exe_dir()?;
    let path = log_path(&dir);
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("failed to read {}: {e}", path.display())),
    };
    let lines: Vec<String> = contents.lines().map(|l| l.to_string()).collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].to_vec())
}
