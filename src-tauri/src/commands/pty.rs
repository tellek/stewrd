// Real PTY support for plugins wanting an interactive terminal (ConPTY on
// Windows, native PTY on macOS/Linux via portable-pty). Unlike shell.rs's
// spawn_command (which just pipes stdout/stderr), this gives a plugin a real
// TTY: resize, proper line-discipline, ANSI escape sequences.
//
// All logic lives in plain inner functions that take 'static sinks
// (on_output/on_exited/on_exit_cleanup) instead of borrowing AppHandle/State
// directly, because the reader/emitter/exit-waiter threads spawned by
// pty_spawn, and the spawn_blocking task in pty_write, all need to move
// their access across a thread boundary - which requires 'static. In
// production the sinks close over a cloned AppHandle, exactly like
// shell.rs's pump_stream/wait task do via app.clone(). In tests they're
// mpsc channels, so the inner logic can be unit-tested without constructing
// a real Tauri AppHandle/State.
//
// The session id is caller-supplied (not derived from the pid): the
// frontend must call listen("pty-output:<id>") / listen("pty-exit:<id>")
// BEFORE invoking pty_spawn, because the emitter thread starts flushing
// almost immediately (~16ms) and on Windows that first batch is often a
// Device Status Report cursor query (see below) - if it's emitted before a
// listener is attached, Tauri drops it and the terminal stalls blank with
// no error. This mirrors the invoke-then-listen order shell.rs's
// spawn_command already requires, just with listen forced to happen first
// since here the id isn't discovered from the invoke's return value.
//
// Windows cursor-position-report gotcha: portable-pty's Windows backend
// creates the pseudoconsole with PSEUDOCONSOLE_INHERIT_CURSOR, which makes
// conhost write a Device Status Report query (ESC[6n) to the output pipe
// and hold back further rendering until a cursor-position reply
// (ESC[<row>;<col>R) is written back via pty_write. A consumer that never
// answers this sees only the DSR query and stalls. Real terminal emulators
// (xterm.js) answer this automatically via onData; plugin authors piping
// pty-output into anything else must answer it themselves.
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc as std_mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

use crate::state::{AppState, PtySession};

const BATCH_INTERVAL: Duration = Duration::from_millis(16);

fn spawn_pty_inner(
    sessions: &Mutex<HashMap<String, PtySession>>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: u16,
    rows: u16,
    mut on_output: impl FnMut(String) + Send + 'static,
    on_exited: impl FnOnce(&str, i32) + Send + 'static,
    on_exit_cleanup: impl FnOnce(&str) + Send + 'static,
) -> Result<(), String> {
    if id.is_empty() {
        return Err("pty session id must not be empty".to_string());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("failed to open pty: {e}"))?;

    let mut cmd = CommandBuilder::new(&program);
    cmd.args(&args);
    if let Some(cwd) = &cwd {
        cmd.cwd(cwd);
    }
    if let Some(env) = &env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("failed to spawn {program}: {e}"))?;
    // The slave end belongs to the child; the host only needs the master.
    drop(pair.slave);

    let killer = child.clone_killer();
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("failed to clone pty reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("failed to take pty writer: {e}"))?;
    let writer = Arc::new(Mutex::new(writer));

    {
        let mut sessions = sessions.lock().unwrap();
        if sessions.contains_key(&id) {
            return Err("pty session id already in use".to_string());
        }
        sessions.insert(
            id.clone(),
            PtySession {
                writer,
                master: pair.master,
                killer,
            },
        );
    }

    // Reader thread: only reads raw bytes and forwards chunks over a
    // channel - no timing logic here, since portable-pty's reader is sync
    // and a blocking read() alone never wakes on a timer with nothing to
    // read.
    let (tx, rx) = std_mpsc::channel::<Vec<u8>>();
    let reader_handle = std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Emitter thread: batches into ~16ms windows, flushing on either a
    // recv timeout (mirrors shell.rs's pump_stream) or channel disconnect
    // (reader hit EOF). Carries over incomplete trailing UTF-8 sequences
    // between iterations instead of using from_utf8_lossy per chunk, which
    // would corrupt split multi-byte chars.
    let emitter_handle = std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match rx.recv_timeout(BATCH_INTERVAL) {
                Ok(chunk) => {
                    pending.extend_from_slice(&chunk);
                }
                Err(std_mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        flush_pending(&mut pending, &mut on_output);
                    }
                    continue;
                }
                Err(std_mpsc::RecvTimeoutError::Disconnected) => {
                    if !pending.is_empty() {
                        flush_pending(&mut pending, &mut on_output);
                    }
                    break;
                }
            }
        }
    });

    // Exit waiter: order matters. On Windows, ConPTY's output pipe only
    // reaches EOF after the master is dropped, so cleanup (which drops the
    // session, including the master) must happen before joining the reader
    // thread, but only after wait() returns.
    std::thread::spawn(move || {
        let status = child.wait();
        let code = status.map(|s| s.exit_code() as i32).unwrap_or(-1);
        on_exit_cleanup(&id);
        let _ = reader_handle.join();
        let _ = emitter_handle.join();
        on_exited(&id, code);
    });

    Ok(())
}

/// Public entry point used by both the #[tauri::command] wrapper and tests.
/// Returns the session id back on success (same id the caller passed in).
#[allow(clippy::too_many_arguments)]
pub fn pty_spawn_with_sinks(
    sessions: &Mutex<HashMap<String, PtySession>>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: u16,
    rows: u16,
    on_output: impl FnMut(String) + Send + 'static,
    on_exited: impl FnOnce(&str, i32) + Send + 'static,
    on_exit_cleanup: impl FnOnce(&str) + Send + 'static,
) -> Result<String, String> {
    let id_for_return = id.clone();
    spawn_pty_inner(
        sessions,
        id,
        program,
        args,
        cwd,
        env,
        cols,
        rows,
        on_output,
        on_exited,
        on_exit_cleanup,
    )?;
    Ok(id_for_return)
}

fn flush_pending(pending: &mut Vec<u8>, on_output: &mut impl FnMut(String)) {
    match std::str::from_utf8(pending) {
        Ok(s) => {
            on_output(s.to_string());
            pending.clear();
        }
        Err(e) => {
            let valid_up_to = e.valid_up_to();
            if valid_up_to > 0 {
                let s = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
                on_output(s);
            }
            pending.drain(..valid_up_to);
        }
    }
}

fn write_inner(sessions: &Mutex<HashMap<String, PtySession>>, id: &str, data: &str) -> Result<(), String> {
    let sessions_guard = sessions.lock().unwrap();
    let session = sessions_guard.get(id).ok_or_else(|| format!("unknown pty session id: {id}"))?;
    let writer = session.writer.clone();
    drop(sessions_guard);
    let mut w = writer.lock().unwrap();
    w.write_all(data.as_bytes()).map_err(|e| format!("pty write failed: {e}"))?;
    w.flush().map_err(|e| format!("pty flush failed: {e}"))?;
    Ok(())
}

pub fn pty_resize_inner(sessions: &Mutex<HashMap<String, PtySession>>, id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = sessions.lock().unwrap();
    let session = sessions.get(id).ok_or_else(|| format!("unknown pty session id: {id}"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("pty resize failed: {e}"))
}

pub fn pty_kill_inner(sessions: &Mutex<HashMap<String, PtySession>>, id: &str) -> Result<(), String> {
    let sessions = sessions.lock().unwrap();
    // Unknown id is a no-op, matching kill_command's existing style. The
    // session is removed only by the exit waiter's on_exit_cleanup, never
    // here, so a kill racing the exit waiter can't double-remove.
    if let Some(session) = sessions.get(id) {
        let mut killer = dyn_clone_killer(&session.killer);
        let _ = killer.kill();
    }
    Ok(())
}

// ChildKiller isn't Clone as a trait object in a way we can call directly
// through &Box<dyn ChildKiller>, so kill through the stored killer's own
// clone_killer(), matching how it was captured at spawn time.
fn dyn_clone_killer(killer: &Box<dyn ChildKiller + Send + Sync>) -> Box<dyn ChildKiller + Send + Sync> {
    killer.clone_killer()
}

#[tauri::command]
pub fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    use tauri::Emitter;

    let sessions = &state.pty_sessions;
    let app_for_output = app.clone();
    let app_for_exit = app.clone();
    let app_for_cleanup = app.clone();

    pty_spawn_with_sinks(
        sessions,
        id.clone(),
        program,
        args,
        cwd,
        env,
        cols,
        rows,
        move |chunk| {
            let _ = app_for_output.emit(&format!("pty-output:{}", id.clone()), chunk);
        },
        move |sid, code| {
            let _ = app_for_exit.emit(&format!("pty-exit:{sid}"), serde_json::json!({ "code": code }));
        },
        move |sid| {
            app_for_cleanup.state::<AppState>().pty_sessions.lock().unwrap().remove(sid);
        },
    )
}

#[tauri::command]
pub async fn pty_write(app: tauri::AppHandle, id: String, data: String) -> Result<(), String> {
    // AppHandle is Clone + Send + 'static (same as shell.rs's pump_stream
    // task), so it - not a borrowed State<'_, AppState> - is what crosses
    // into spawn_blocking. The map lookup + Arc clone happen inside the
    // blocking closure, immediately followed by releasing the map lock, so
    // only the writer Arc is held across the actual (potentially blocking)
    // write - not the session-map lock, which would otherwise stall
    // pty_kill/pty_resize/the exit waiter's cleanup/the RunEvent::Exit
    // handler.
    tokio::task::spawn_blocking(move || {
        let state = app.state::<AppState>();
        write_inner(&state.pty_sessions, &id, &data)
    })
    .await
    .map_err(|e| format!("pty write task panicked: {e}"))??;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(state: tauri::State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    pty_resize_inner(&state.pty_sessions, &id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    pty_kill_inner(&state.pty_sessions, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn spawns_cmd_echo_and_captures_output_and_exit_code() {
        // Arc so the on_exit_cleanup closure (which must be 'static, since
        // it's moved into a spawned thread - mirroring how production code
        // closes over a cloned AppHandle) can actually remove the session,
        // which is what lets the reader thread observe EOF on Windows.
        let sessions: Arc<Mutex<HashMap<String, PtySession>>> = Arc::new(Mutex::new(HashMap::new()));
        let sessions_for_cleanup = sessions.clone();
        let (out_tx, out_rx) = mpsc::channel::<String>();
        let (exit_tx, exit_rx) = mpsc::channel::<i32>();
        let (cleanup_tx, cleanup_rx) = mpsc::channel::<String>();

        let writer_for_dsr: Arc<Mutex<Option<Arc<Mutex<Box<dyn Write + Send>>>>>> = Arc::new(Mutex::new(None));
        let writer_for_dsr_clone = writer_for_dsr.clone();

        pty_spawn_with_sinks(
            &sessions,
            "test-echo".to_string(), // sessions derefs Arc<Mutex<..>> -> &Mutex<..>
            "cmd".to_string(),
            vec!["/c".to_string(), "echo".to_string(), "hi".to_string()],
            None,
            None,
            80,
            24,
            move |chunk| {
                let _ = out_tx.send(chunk);
            },
            move |sid, code| {
                let _ = exit_tx.send(code);
                let _ = sid;
            },
            move |sid| {
                sessions_for_cleanup.lock().unwrap().remove(sid);
                let _ = cleanup_tx.send(sid.to_string());
            },
        )
        .expect("spawn should succeed");

        // Grab the writer so we can answer the Windows DSR cursor query if
        // one shows up (portable-pty's ConPTY backend queries cursor
        // position before rendering).
        {
            let sessions = sessions.lock().unwrap();
            if let Some(session) = sessions.get("test-echo") {
                *writer_for_dsr_clone.lock().unwrap() = Some(session.writer.clone());
            }
        }

        let mut saw_hi = false;
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            match out_rx.recv_timeout(Duration::from_millis(500)) {
                Ok(chunk) => {
                    if chunk.contains("\x1b[6n") {
                        if let Some(w) = writer_for_dsr.lock().unwrap().as_ref() {
                            let mut w = w.lock().unwrap();
                            let _ = w.write_all(b"\x1b[1;1R");
                            let _ = w.flush();
                        }
                    }
                    if chunk.contains("hi") {
                        saw_hi = true;
                        break;
                    }
                }
                Err(_) => continue,
            }
        }
        assert!(saw_hi, "expected pty output to contain 'hi'");

        let code = exit_rx.recv_timeout(Duration::from_secs(5)).expect("should receive exit code");
        assert_eq!(code, 0);
        let cleaned_up_id = cleanup_rx.recv_timeout(Duration::from_secs(5)).expect("should receive cleanup id");
        assert_eq!(cleaned_up_id, "test-echo");
    }

    #[test]
    fn spawn_with_duplicate_live_id_errors() {
        let sessions: Mutex<HashMap<String, PtySession>> = Mutex::new(HashMap::new());
        let spawn_one = |sessions: &Mutex<HashMap<String, PtySession>>, id: &str| {
            pty_spawn_with_sinks(
                sessions,
                id.to_string(),
                "cmd".to_string(),
                vec!["/c".to_string(), "echo".to_string(), "hi".to_string()],
                None,
                None,
                80,
                24,
                |_chunk| {},
                |_sid, _code| {},
                |_sid| {},
            )
        };

        spawn_one(&sessions, "dup-id").expect("first spawn should succeed");
        let err = spawn_one(&sessions, "dup-id").expect_err("second spawn with same live id should fail");
        assert!(err.contains("already in use"), "unexpected error: {err}");

        pty_kill_inner(&sessions, "dup-id").expect("kill should not error");
    }

    #[test]
    fn write_resize_kill_with_unknown_id_are_clean() {
        let sessions: Mutex<HashMap<String, PtySession>> = Mutex::new(HashMap::new());
        let err = write_inner(&sessions, "no-such-id", "data");
        assert!(err.is_err());
        let err = pty_resize_inner(&sessions, "no-such-id", 80, 24);
        assert!(err.is_err());
        let result = pty_kill_inner(&sessions, "no-such-id");
        assert!(result.is_ok());
    }
}
