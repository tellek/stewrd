use notify_debouncer_full::{Debouncer, RecommendedCache};
use notify_debouncer_full::notify::RecommendedWatcher;
use std::sync::Mutex;

/// Owns the plugin dist/ watcher so it isn't dropped (dropping a notify
/// debouncer stops delivery silently).
#[derive(Default)]
pub struct AppState {
    pub plugin_watcher: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
}
