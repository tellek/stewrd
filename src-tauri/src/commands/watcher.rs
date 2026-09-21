// Watches every plugin's directory tree and emits "plugin-changed" with the
// affected plugin's directory name, so the frontend can hot-reload/hot-add/
// hot-remove just that one plugin. Matches on ANY change within a plugin's
// immediate subtree (not just dist/index.js specifically) - a whole-folder
// delete (hot-remove) may only ever emit a single remove event for the
// directory path itself, never a per-file "dist/index.js" event, so a
// filename-specific match would miss it entirely.
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Result as NotifyResult};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn changed_plugin_dirs(paths: &[PathBuf], plugins_root: &Path) -> HashSet<String> {
    let mut ids = HashSet::new();
    for path in paths {
        if let Ok(relative) = path.strip_prefix(plugins_root) {
            if let Some(std::path::Component::Normal(name)) = relative.components().next() {
                ids.insert(name.to_string_lossy().to_string());
            }
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_paths_outside_the_plugins_root() {
        let root = Path::new("/plugins");
        let paths = vec![PathBuf::from("/somewhere/else/file.txt")];
        assert!(changed_plugin_dirs(&paths, root).is_empty());
    }

    #[test]
    fn maps_a_nested_path_to_its_top_level_plugin_segment() {
        let root = Path::new("/plugins");
        let paths = vec![PathBuf::from("/plugins/foo/dist/index.js")];
        let ids = changed_plugin_dirs(&paths, root);
        assert_eq!(ids, HashSet::from(["foo".to_string()]));
    }

    #[test]
    fn dedupes_duplicate_results_from_multiple_paths_in_the_same_plugin() {
        let root = Path::new("/plugins");
        let paths = vec![
            PathBuf::from("/plugins/foo/dist/index.js"),
            PathBuf::from("/plugins/foo/plugin.json"),
        ];
        let ids = changed_plugin_dirs(&paths, root);
        assert_eq!(ids, HashSet::from(["foo".to_string()]));
    }

    #[test]
    fn the_root_directory_itself_yields_nothing() {
        let root = Path::new("/plugins");
        let paths = vec![PathBuf::from("/plugins")];
        assert!(changed_plugin_dirs(&paths, root).is_empty());
    }
}

pub fn start_watching(
    app: AppHandle,
    plugins_dir: PathBuf,
) -> NotifyResult<Debouncer<RecommendedWatcher, RecommendedCache>> {
    let plugins_root = plugins_dir.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(1000),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let all_paths: Vec<PathBuf> = events.iter().flat_map(|e| e.paths.clone()).collect();
                for id in changed_plugin_dirs(&all_paths, &plugins_root) {
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
