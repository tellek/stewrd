// Custom #[tauri::command] functions, not @tauri-apps/plugin-shell - Tauri's
// ACL/capabilities system only scopes commands registered by official
// plugins (which require allowlisting each command name + arg regex,
// structurally incompatible with "run anything the plugin author passes").
// Commands on the app's own invoke_handler need no capability entry. Always
// pass program + args separately; never build a `sh -c "<concatenated>"`.
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;
use tauri::Manager;
use tokio::io::AsyncRead;
use tokio::process::Command;

use crate::state::AppState;

#[derive(Serialize)]
pub struct ExecResult {
    code: i32,
    stdout: String,
    stderr: String,
}

fn build_command(program: &str, args: &[String], cwd: &Option<String>, env: &Option<HashMap<String, String>>) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    if let Some(env) = env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }
    // Spawned processes should never flash a console window on Windows.
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// exec() only rejects on spawn failure - a non-zero exit code is a normal
/// resolved value, not a thrown error, so plugin authors check `code` themselves.
#[tauri::command]
pub async fn run_command(
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<ExecResult, String> {
    let output = build_command(&program, &args, &cwd, &env)
        .output()
        .await
        .map_err(|e| format!("failed to spawn {program}: {e}"))?;
    Ok(ExecResult {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// Streams stdout/stderr batched into ~30ms windows (a chatty process emitting
/// one event per line would flood the IPC bridge and jank the UI).
async fn pump_stream<R: AsyncRead + Unpin>(mut reader: R, app: tauri::AppHandle, id: String, stream: &'static str) {
    use tauri::Emitter;
    use tokio::io::AsyncReadExt;

    let mut buf = [0u8; 4096];
    let mut pending = String::new();
    loop {
        match tokio::time::timeout(Duration::from_millis(30), reader.read(&mut buf)).await {
            Ok(Ok(0)) => break, // EOF
            Ok(Ok(n)) => {
                pending.push_str(&String::from_utf8_lossy(&buf[..n]));
                if pending.len() > 8192 {
                    let _ = app.emit(&format!("process-output:{id}"), serde_json::json!({"stream": stream, "chunk": pending}));
                    pending.clear();
                }
            }
            Ok(Err(_)) => break,
            Err(_) => {
                if !pending.is_empty() {
                    let _ = app.emit(&format!("process-output:{id}"), serde_json::json!({"stream": stream, "chunk": pending}));
                    pending.clear();
                }
            }
        }
    }
    if !pending.is_empty() {
        let _ = app.emit(&format!("process-output:{id}"), serde_json::json!({"stream": stream, "chunk": pending}));
    }
}

/// Returns the process id immediately; output streams via process-output:<id>
/// events and completion via process-exit:<id>. Uses the OS pid as the
/// process id - simple, unique while the process is alive, and matches the
/// `pid` field callers already get back.
#[tauri::command]
pub async fn spawn_command(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    use tauri::Emitter;

    let mut cmd = build_command(&program, &args, &cwd, &env);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("failed to spawn {program}: {e}"))?;
    let pid = child.id().ok_or("spawned process has no pid (already exited)")?;
    let id = pid.to_string();

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    tokio::spawn(pump_stream(stdout, app.clone(), id.clone(), "stdout"));
    tokio::spawn(pump_stream(stderr, app.clone(), id.clone(), "stderr"));

    let (kill_tx, kill_rx) = tokio::sync::oneshot::channel();
    state.child_kill_senders.lock().unwrap().insert(id.clone(), kill_tx);
    state.child_pids.lock().unwrap().insert(id.clone(), pid);

    let app_for_task = app.clone();
    let id_for_task = id.clone();
    tokio::spawn(async move {
        let status = tokio::select! {
            status = child.wait() => status,
            _ = kill_rx => {
                let _ = child.start_kill();
                child.wait().await
            }
        };
        let code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
        let _ = app_for_task.emit(&format!("process-exit:{id_for_task}"), serde_json::json!({"code": code}));
        let app_state = app_for_task.state::<AppState>();
        app_state.child_kill_senders.lock().unwrap().remove(&id_for_task);
        app_state.child_pids.lock().unwrap().remove(&id_for_task);
    });

    Ok(pid)
}

#[tauri::command]
pub fn kill_command(state: tauri::State<'_, AppState>, process_id: String) -> Result<(), String> {
    if let Some(tx) = state.child_kill_senders.lock().unwrap().remove(&process_id) {
        let _ = tx.send(());
    }
    Ok(())
}
