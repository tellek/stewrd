use notify_debouncer_full::notify::RecommendedWatcher;
use notify_debouncer_full::{Debouncer, RecommendedCache};
use portable_pty::{ChildKiller, MasterPty};
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot::Sender;

/// A live PTY session started via `pty_spawn` (see `commands/pty.rs`).
/// `writer` is `Arc<Mutex<..>>` rather than a bare `Box` so `pty_write` can
/// clone it out and release the `pty_sessions` lock before doing a
/// potentially-blocking write.
pub struct PtySession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
}

/// Owns the plugin dist/ watcher so it isn't dropped (dropping a notify
/// debouncer stops delivery silently), and tracks spawned child processes so
/// app shutdown can explicitly kill any still-running ones - Windows does not
/// kill child processes when the parent exits.
///
/// `child_kill_senders` is for the normal-runtime kill_command path (the
/// owning tokio task is alive and scheduled normally). `child_pids` is a
/// separate, redundant record used ONLY at process-exit time: a
/// RunEvent::Exit handler cannot rely on the async runtime still being
/// scheduled to act on a oneshot signal sent to a spawned task, so exit-time
/// cleanup kills each tracked pid directly via a synchronous OS call instead.
#[derive(Default)]
pub struct AppState {
    pub plugin_watcher: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    pub child_kill_senders: Mutex<HashMap<String, Sender<()>>>,
    pub child_pids: Mutex<HashMap<String, u32>>,
    pub pty_sessions: Mutex<HashMap<String, PtySession>>,
}
