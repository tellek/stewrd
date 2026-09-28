// Watches every plugin's directory tree and emits "plugin-changed" with the
// affected plugin's directory name, so the frontend can hot-reload/hot-add/
// hot-remove just that one plugin. Matches on ANY change within a plugin's
// immediate subtree (not just dist/index.js specifically) - a whole-folder
// delete (hot-remove) may only ever emit a single remove event for the
// directory path itself, never a per-file "dist/index.js" event, so a
// filename-specific match would miss it entirely.
//
// Two kinds of a plugin's own runtime writes are deliberately ignored so
// they don't trigger a pointless hot-reload (which would remount the
// plugin's whole Component, dropping in-progress UI state like cursor
// position/scroll):
//   - `<plugin>/data/...` - the plugin's own sandboxed api.fs storage.
//   - `<plugin>/storage.json` (and its `storage.json.tmp` write-staging
//     file) - the plugin's own api.storage key/value store (storage.rs's
//     write_store_atomic tmp-then-rename). This includes the host's own
//     settings, stored under the synthetic "__host__" plugin id.
// A storage.json rewrite is a tmp-write-then-rename directly inside the
// plugin's own folder (there's no subfolder to catch it at, unlike data/),
// and on Windows that can surface as a plain Modify event on the plugin
// folder itself (a bare path with no filename component) in addition to -
// or instead of - events naming storage.json/storage.json.tmp specifically.
// That bare-folder Modify noise is filtered out below too, but only for
// ModifyKind::Any/Data/Metadata ("file changed underneath me" noise) -
// never for ModifyKind::Name (rename), Create, or Remove, since those are
// exactly how a whole-folder rename/hot-add/hot-remove is detected.
use notify_debouncer_full::notify::event::{EventKind, ModifyKind};
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Result as NotifyResult};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, DebouncedEvent, RecommendedCache};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Bare-folder "file changed underneath me" noise - the shape a
/// storage.json tmp-write-then-rename can surface as on Windows when it's
/// reported against the containing directory rather than (or alongside) the
/// specific file paths. Deliberately excludes ModifyKind::Name (rename) so
/// a plugin folder being renamed on disk still triggers a real change.
fn is_bare_folder_modify_noise(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Modify(ModifyKind::Any | ModifyKind::Data(_) | ModifyKind::Metadata(_))
    )
}

fn changed_plugin_dirs(events: &[(PathBuf, EventKind)], plugins_root: &Path) -> HashSet<String> {
    let mut ids = HashSet::new();
    for (path, kind) in events {
        let Ok(relative) = path.strip_prefix(plugins_root) else {
            continue;
        };
        let mut components = relative.components();
        let Some(std::path::Component::Normal(name)) = components.next() else {
            continue;
        };
        match components.next() {
            // `<plugin>/data/` is the plugin's own runtime storage (see
            // fs.rs's fs_plugin_data_dir) - notes, caches, etc a plugin
            // writes at runtime, not source it was built from. A save in
            // there shouldn't trigger the same hot-reload as an edited
            // source file, which would remount the plugin and lose
            // in-progress UI state (cursor position, unsaved local state).
            Some(std::path::Component::Normal(next)) if next == "data" => continue,
            // `<plugin>/storage.json` (and its write-staging temp file) is
            // the plugin's own api.storage key/value store - same
            // reasoning as data/ above.
            Some(std::path::Component::Normal(next))
                if next == "storage.json" || next == "storage.json.tmp" =>
            {
                continue
            }
            // A bare `<plugin>` path (no further component) that's just
            // "file changed underneath me" noise, not a rename/create/
            // remove of the folder itself - see the module doc comment.
            None if is_bare_folder_modify_noise(kind) => continue,
            _ => {}
        }
        ids.insert(name.to_string_lossy().to_string());
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    fn modify_any(path: &str) -> (PathBuf, EventKind) {
        (PathBuf::from(path), EventKind::Modify(ModifyKind::Any))
    }

    #[test]
    fn ignores_paths_outside_the_plugins_root() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/somewhere/else/file.txt")];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn maps_a_nested_path_to_its_top_level_plugin_segment() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/plugins/foo/dist/index.js")];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["foo".to_string()]));
    }

    #[test]
    fn dedupes_duplicate_results_from_multiple_paths_in_the_same_plugin() {
        let root = Path::new("/plugins");
        let events = vec![
            modify_any("/plugins/foo/dist/index.js"),
            modify_any("/plugins/foo/plugin.json"),
        ];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["foo".to_string()]));
    }

    #[test]
    fn the_root_directory_itself_yields_nothing() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/plugins")];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn ignores_a_plugins_own_runtime_data_dir() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/plugins/notepad/data/note.md")];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn still_reacts_to_source_changes_alongside_ignored_data_changes() {
        let root = Path::new("/plugins");
        let events = vec![
            modify_any("/plugins/notepad/data/note.md"),
            modify_any("/plugins/notepad/dist/index.js"),
        ];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["notepad".to_string()]));
    }

    #[test]
    fn ignores_a_plugins_own_storage_file() {
        let root = Path::new("/plugins");
        let events = vec![
            modify_any("/plugins/notepad/storage.json"),
            modify_any("/plugins/notepad/storage.json.tmp"),
        ];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn ignores_the_hosts_own_storage_file() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/plugins/__host__/storage.json")];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn ignores_bare_folder_modify_noise_from_a_storage_json_rename() {
        let root = Path::new("/plugins");
        let events = vec![modify_any("/plugins/notepad")];
        assert!(changed_plugin_dirs(&events, root).is_empty());
    }

    #[test]
    fn still_reacts_to_a_bare_folder_rename_event() {
        let root = Path::new("/plugins");
        let events = vec![(
            PathBuf::from("/plugins/notepad"),
            EventKind::Modify(ModifyKind::Name(notify_debouncer_full::notify::event::RenameMode::Any)),
        )];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["notepad".to_string()]));
    }

    #[test]
    fn still_reacts_to_a_bare_folder_create_event() {
        let root = Path::new("/plugins");
        let events = vec![(
            PathBuf::from("/plugins/notepad"),
            EventKind::Create(notify_debouncer_full::notify::event::CreateKind::Folder),
        )];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["notepad".to_string()]));
    }

    #[test]
    fn still_reacts_to_a_bare_folder_remove_event() {
        let root = Path::new("/plugins");
        let events = vec![(
            PathBuf::from("/plugins/notepad"),
            EventKind::Remove(notify_debouncer_full::notify::event::RemoveKind::Folder),
        )];
        let ids = changed_plugin_dirs(&events, root);
        assert_eq!(ids, HashSet::from(["notepad".to_string()]));
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
                let all_events: Vec<(PathBuf, EventKind)> = events
                    .iter()
                    .flat_map(|e: &DebouncedEvent| {
                        let kind = e.event.kind;
                        e.paths.iter().cloned().map(move |p| (p, kind))
                    })
                    .collect();
                for id in changed_plugin_dirs(&all_events, &plugins_root) {
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
