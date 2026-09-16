use notify_debouncer_full::notify::RecommendedWatcher;
use notify_debouncer_full::{Debouncer, RecommendedCache};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot::Sender;

/// Owns the plugin dist/ watcher so it isn't dropped (dropping a notify
/// debouncer stops delivery silently), and tracks spawned child processes'
/// kill signals so app shutdown can explicitly kill any still-running
/// children - Windows does not kill child processes when the parent exits.
#[derive(Default)]
pub struct AppState {
    pub plugin_watcher: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    pub child_kill_senders: Mutex<HashMap<String, Sender<()>>>,
}
