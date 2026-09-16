// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod state;

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
        .setup(|app| {
            let app_handle = app.handle().clone();
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
            commands::storage::storage_get,
            commands::storage::storage_set,
            commands::storage::storage_get_all,
            commands::logging::append_log_line,
            commands::shell::run_command,
            commands::shell::spawn_command,
            commands::shell::kill_command,
            commands::fs::fs_read_text_file,
            commands::fs::fs_write_text_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Windows does not kill child processes when the parent exits, so
            // any still-running spawned children must be explicitly killed here.
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                let mut senders = state.child_kill_senders.lock().unwrap();
                for (_, tx) in senders.drain() {
                    let _ = tx.send(());
                }
            }
        });
}
