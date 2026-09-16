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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
