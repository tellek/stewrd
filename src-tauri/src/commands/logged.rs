// Thin registration-time wrappers around the higher-risk commands (fs,
// storage, shell, plugin install) that also might genuinely fail at runtime.
// Each wrapper restates its inner command's signature (Tauri deserializes
// invoke() args by name, so names must match exactly), calls straight
// through to the real implementation in fs.rs/storage.rs/shell.rs/
// plugin_install.rs unchanged, and logs on Err via log_command_error before
// returning the same Result to the caller. The inner command files never
// import or know about logging - this file is the only integration point,
// so a new risky command needs one wrapper added here, not a change to its
// own implementation.
//
// Registered under these exact IPC names in lib.rs's invoke_handler!
// (replacing the plain commands, not alongside them) via
// #[tauri::command(rename = "...")] - the Rust fn identifiers below are
// suffixed `_logged` purely because Tauri's command macro generates
// crate-global helper items keyed by the *identifier*, not the rename
// string, and would otherwise collide with the originals in fs.rs etc.
use std::collections::HashMap;
use tauri::AppHandle;

use super::fs as fs_cmd;
use super::logging::log_command_error;
use super::plugin_install as plugin_install_cmd;
use super::pty as pty_cmd;
use super::shell as shell_cmd;
use super::storage as storage_cmd;
use crate::state::AppState;

#[tauri::command(rename = "fs_read_text_file")]
pub fn fs_read_text_file_logged(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    let result = fs_cmd::fs_read_text_file(app.clone(), plugin_id, path);
    if let Err(e) = &result {
        log_command_error(&app, "fs_read_text_file", e);
    }
    result
}

#[tauri::command(rename = "fs_write_text_file")]
pub fn fs_write_text_file_logged(
    app: AppHandle,
    plugin_id: String,
    path: String,
    contents: String,
) -> Result<(), String> {
    let result = fs_cmd::fs_write_text_file(app.clone(), plugin_id, path, contents);
    if let Err(e) = &result {
        log_command_error(&app, "fs_write_text_file", e);
    }
    result
}

#[tauri::command(rename = "fs_delete_file")]
pub fn fs_delete_file_logged(app: AppHandle, plugin_id: String, path: String) -> Result<(), String> {
    let result = fs_cmd::fs_delete_file(app.clone(), plugin_id, path);
    if let Err(e) = &result {
        log_command_error(&app, "fs_delete_file", e);
    }
    result
}

#[tauri::command(rename = "fs_rename_file")]
pub fn fs_rename_file_logged(app: AppHandle, plugin_id: String, from: String, to: String) -> Result<(), String> {
    let result = fs_cmd::fs_rename_file(app.clone(), plugin_id, from, to);
    if let Err(e) = &result {
        log_command_error(&app, "fs_rename_file", e);
    }
    result
}

#[tauri::command(rename = "storage_get")]
pub fn storage_get_logged(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    let result = storage_cmd::storage_get(app.clone(), plugin_id, key);
    if let Err(e) = &result {
        log_command_error(&app, "storage_get", e);
    }
    result
}

#[tauri::command(rename = "storage_set")]
pub fn storage_set_logged(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let result = storage_cmd::storage_set(app.clone(), plugin_id, key, value);
    if let Err(e) = &result {
        log_command_error(&app, "storage_set", e);
    }
    result
}

#[tauri::command(rename = "storage_get_all")]
pub fn storage_get_all_logged(
    app: AppHandle,
    plugin_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let result = storage_cmd::storage_get_all(app.clone(), plugin_id);
    if let Err(e) = &result {
        log_command_error(&app, "storage_get_all", e);
    }
    result
}

#[tauri::command(rename = "run_command")]
pub async fn run_command_logged(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<shell_cmd::ExecResult, String> {
    let result = shell_cmd::run_command(program, args, cwd, env).await;
    if let Err(e) = &result {
        log_command_error(&app, "run_command", e);
    }
    result
}

#[tauri::command(rename = "spawn_command")]
pub async fn spawn_command_logged(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    let result = shell_cmd::spawn_command(app.clone(), state, program, args, cwd, env).await;
    if let Err(e) = &result {
        log_command_error(&app, "spawn_command", e);
    }
    result
}

#[tauri::command(rename = "pty_spawn")]
#[allow(clippy::too_many_arguments)]
pub fn pty_spawn_logged(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let result = pty_cmd::pty_spawn(app.clone(), state, id, program, args, cwd, env, cols, rows);
    if let Err(e) = &result {
        log_command_error(&app, "pty_spawn", e);
    }
    result
}

#[tauri::command(rename = "pty_write")]
pub async fn pty_write_logged(app: AppHandle, id: String, data: String) -> Result<(), String> {
    let result = pty_cmd::pty_write(app.clone(), id, data).await;
    if let Err(e) = &result {
        log_command_error(&app, "pty_write", e);
    }
    result
}

#[tauri::command(rename = "install_plugin_from_archive")]
pub fn install_plugin_from_archive_logged(
    app: AppHandle,
    bytes: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let result = plugin_install_cmd::install_plugin_from_archive(app.clone(), bytes, file_name);
    if let Err(e) = &result {
        log_command_error(&app, "install_plugin_from_archive", e);
    }
    result
}

#[tauri::command(rename = "install_plugin_from_url")]
pub async fn install_plugin_from_url_logged(
    app: AppHandle,
    url: String,
    file_name: String,
    mode: plugin_install_cmd::InstallMode,
    expected_dir: Option<String>,
) -> Result<String, String> {
    let result = plugin_install_cmd::install_plugin_from_url(app.clone(), url, file_name, mode, expected_dir).await;
    if let Err(e) = &result {
        log_command_error(&app, "install_plugin_from_url", e);
    }
    result
}
