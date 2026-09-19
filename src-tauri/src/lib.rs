// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod state;

use commands::interval::IntervalState;
use state::AppState;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .manage(IntervalState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let plugins_dir = commands::plugins::resolve_plugins_dir(&app_handle)?;
            commands::plugins::migrate_legacy_appdata_plugins(&app_handle, &plugins_dir);
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
            commands::plugin_install::install_plugin_from_archive,
            commands::plugin_settings::read_plugin_settings_file,
            commands::plugin_settings::write_plugin_settings_file,
            commands::storage::storage_get,
            commands::storage::storage_set,
            commands::storage::storage_get_all,
            commands::logging::append_log_line,
            commands::shell::run_command,
            commands::shell::spawn_command,
            commands::shell::kill_command,
            commands::fs::fs_read_text_file,
            commands::fs::fs_write_text_file,
            commands::fs::fs_read_data_url,
            commands::fs::fs_list_dir,
            commands::fs::fs_get_root_path,
            commands::fs::fs_delete_file,
            commands::fs::fs_rename_file,
            commands::interval::start_interval,
            commands::interval::stop_interval,
            commands::plugin_icons::get_plugin_icon,
            commands::category_icons::list_category_icons,
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
