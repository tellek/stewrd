// A reliable Rust-side heartbeat for plugins whose background work must
// survive the window being minimized/occluded, where WebView2/WKWebView
// throttle JS setTimeout/setInterval (see docs/architecture-plan.md "Tick
// scheduler" - known limitation). A tokio::interval runs independently of the
// webview's own timer throttling and just emits an event; the plugin does its
// actual work (e.g. a git status check) in its own event listener.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(Default)]
pub struct IntervalState {
    stop_senders: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[tauri::command]
pub async fn start_interval(
    app: AppHandle,
    state: tauri::State<'_, IntervalState>,
    key: String,
    interval_ms: u64,
) -> Result<(), String> {
    // Replace any existing ticker under this key rather than stacking a
    // second one.
    if let Some(tx) = state.stop_senders.lock().unwrap().remove(&key) {
        let _ = tx.send(());
    }

    let (stop_tx, mut stop_rx) = oneshot::channel();
    state.stop_senders.lock().unwrap().insert(key.clone(), stop_tx);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_millis(interval_ms.max(1000)));
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    let _ = app.emit(&format!("interval-tick:{key}"), ());
                }
                _ = &mut stop_rx => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_interval(state: tauri::State<'_, IntervalState>, key: String) -> Result<(), String> {
    if let Some(tx) = state.stop_senders.lock().unwrap().remove(&key) {
        let _ = tx.send(());
    }
    Ok(())
}
