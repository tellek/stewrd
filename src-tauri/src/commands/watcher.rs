// Watches every plugin's dist/index.js for changes and emits "plugin-changed"
// with the affected plugin's directory name, so the frontend can hot-reload
// just that one plugin (fresh Blob URL, revoke the old one).
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Result as NotifyResult};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn changed_plugin_dirs(paths: &[PathBuf]) -> HashSet<String> {
    let mut ids = HashSet::new();
    for path in paths {
        let is_dist_index = path.file_name().map(|f| f == "index.js").unwrap_or(false)
            && path
                .parent()
                .and_then(Path::file_name)
                .map(|f| f == "dist")
                .unwrap_or(false);
        if !is_dist_index {
            continue;
        }
        if let Some(plugin_dir_name) = path.parent().and_then(Path::parent).and_then(Path::file_name) {
            ids.insert(plugin_dir_name.to_string_lossy().to_string());
        }
    }
    ids
}

pub fn start_watching(
    app: AppHandle,
    plugins_dir: PathBuf,
) -> NotifyResult<Debouncer<RecommendedWatcher, RecommendedCache>> {
    let mut debouncer = new_debouncer(
        Duration::from_millis(1000),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let all_paths: Vec<PathBuf> = events.iter().flat_map(|e| e.paths.clone()).collect();
                for id in changed_plugin_dirs(&all_paths) {
                    let _ = app.emit("plugin-changed", id);
                }
            }
            Err(errors) => {
                for e in errors {
                    eprintln!("[stewrd] plugin watcher error: {e:?}");
                }
            }
        },
    )?;

    debouncer.watch(&plugins_dir, RecursiveMode::Recursive)?;
    Ok(debouncer)
}
