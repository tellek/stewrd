// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod state;

use commands::interval::IntervalState;
use commands::logging::log_line_to_disk_and_ui;
use state::AppState;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Applies a previously-downloaded update (if any) before anything else
    // starts - see commands/updates.rs. Debug-gated: a dev build's
    // current_exe() points at target/debug/stewrd.exe, and this must never
    // touch that.
    #[cfg(not(debug_assertions))]
    commands::updates::apply_pending_update_if_present();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .manage(IntervalState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Global panic hook: writes straight to stewrd.log and, if the
            // process survives (dev/debug - release builds abort right after
            // per Cargo.toml's panic="abort", so the emit below only reaches
            // a running UI in dev/debug builds; the file write still lands
            // either way), pushes it live via the same `log-line` event the
            // wrapped commands in commands/logged.rs use.
            let panic_app_handle = app_handle.clone();
            std::panic::set_hook(Box::new(move |info| {
                let message = info
                    .payload()
                    .downcast_ref::<&str>()
                    .map(|s| s.to_string())
                    .or_else(|| info.payload().downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".to_string());
                let location = info
                    .location()
                    .map(|l| format!(" ({}:{}:{})", l.file(), l.line(), l.column()))
                    .unwrap_or_default();
                log_line_to_disk_and_ui(&panic_app_handle, "error", None, &format!("panic: {message}{location}"));
            }));

            // Auto-update: log the one-time "Updated to vX.Y.Z" confirmation
            // if apply_pending_update_if_present() just ran, then spawn the
            // background version check - unless this same launch already
            // just applied an update, in which case checking again would
            // immediately re-download the release just installed (this
            // process still has the pre-update version compiled in until
            // its own next restart).
            #[cfg(not(debug_assertions))]
            {
                let just_updated = commands::updates::consume_just_updated_marker(&app_handle);
                if !just_updated {
                    let check_app_handle = app_handle.clone();
                    tauri::async_runtime::spawn(commands::updates::check_for_update(check_app_handle));
                }
            }

            let plugins_dir = commands::plugins::resolve_plugins_dir(&app_handle)?;
            match commands::watcher::start_watching(app_handle.clone(), plugins_dir) {
                Ok(debouncer) => {
                    let state = app_handle.state::<AppState>();
                    *state.plugin_watcher.lock().unwrap() = Some(debouncer);
                }
                Err(e) => {
                    eprintln!("[stewrd] failed to start plugin watcher: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::plugins::list_plugins,
            commands::plugins::is_safe_mode,
            commands::plugins::reconcile_boot_marks,
            commands::plugins::mark_plugin_attempt,
            commands::plugins::clear_plugin_attempt,
            commands::plugins::set_plugin_disabled,
            commands::plugins::remove_plugin,
            commands::logged::install_plugin_from_archive_logged,
            commands::plugin_settings::read_plugin_settings_file,
            commands::plugin_settings::write_plugin_settings_file,
            commands::logged::storage_get_logged,
            commands::logged::storage_set_logged,
            commands::logged::storage_get_all_logged,
            commands::logging::append_log_line,
            commands::logging::read_log_lines,
            commands::logged::run_command_logged,
            commands::logged::spawn_command_logged,
            commands::shell::kill_command,
            commands::logged::fs_read_text_file_logged,
            commands::logged::fs_write_text_file_logged,
            commands::fs::fs_read_data_url,
            commands::fs::fs_list_dir,
            commands::fs::fs_get_root_path,
            commands::logged::fs_delete_file_logged,
            commands::logged::fs_rename_file_logged,
            commands::interval::start_interval,
            commands::interval::stop_interval,
            commands::plugin_icons::get_plugin_icon,
            commands::category_icons::list_category_icons,
            commands::updates::list_releases,
            commands::updates::pending_update_version,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Windows does not kill child processes when the parent exits, so
            // any still-running spawned children must be explicitly killed
            // here. This can't route through the normal kill_command oneshot
            // signal - by RunEvent::Exit time there's no guarantee the tokio
            // runtime is still scheduled to act on it - so this kills each
            // tracked pid directly via a synchronous OS call instead.
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                let pids: Vec<u32> = state.child_pids.lock().unwrap().values().copied().collect();
                for pid in pids {
                    #[cfg(windows)]
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string(), "/T"])
                        .status();
                    #[cfg(not(windows))]
                    let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).status();
                }
            }
        });
}
