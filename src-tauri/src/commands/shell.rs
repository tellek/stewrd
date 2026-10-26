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

pub(crate) fn build_command(program: &str, args: &[String], cwd: &Option<String>, env: &Option<HashMap<String, String>>) -> Command {
    // Resolve through PATH + PATHEXT so npm-installed CLIs (`codex.cmd` etc.)
    // launch on Windows - Command::new alone only finds `.exe`. Falls back to
    // the bare name so a missing program still reports the usual spawn error.
    let resolved = which::which(program).map(|p| p.into_os_string()).unwrap_or_else(|_| program.into());
    let mut cmd = Command::new(resolved);
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

/// Rust refuses to pass newlines and some metacharacters to a `.cmd`/`.bat`
/// (it surfaces as InvalidInput). Name that clearly rather than letting it
/// read as "program not found".
fn spawn_error(program: &str, e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::InvalidInput {
        return format!("batch file arguments are invalid for {program}: the prompt can't be passed to a .cmd shim, install the native (.exe) version of this CLI");
    }
    format!("failed to spawn {program}: {e}")
}

/// Writes `input` to the child's stdin and closes it (EOF). BrokenPipe and
/// friends are ignored on purpose: a CLI that exits early (not logged in, bad
/// flag) reports why through its exit code and stderr, not through this write.
async fn feed_stdin(mut stdin: tokio::process::ChildStdin, input: String) {
    use tokio::io::AsyncWriteExt;
    let _ = stdin.write_all(input.as_bytes()).await;
    let _ = stdin.shutdown().await;
}

/// Kills the whole process tree. A `.cmd` launch makes cmd.exe the tracked
/// pid with the real CLI as a grandchild, and start_kill only reaches the
/// former. Goes through build_command so CREATE_NO_WINDOW applies.
#[cfg(windows)]
async fn kill_tree(pid: u32) {
    let _ = build_command("taskkill", &["/F".to_string(), "/T".to_string(), "/PID".to_string(), pid.to_string()], &None, &None)
        .output()
        .await;
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
    stdin: Option<String>,
) -> Result<u32, String> {
    use tauri::Emitter;

    let mut cmd = build_command(&program, &args, &cwd, &env);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if stdin.is_some() {
        cmd.stdin(Stdio::piped());
    }
    let mut child = cmd.spawn().map_err(|e| spawn_error(&program, &e))?;
    let pid = child.id().ok_or("spawned process has no pid (already exited)")?;
    let id = pid.to_string();

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    tokio::spawn(pump_stream(stdout, app.clone(), id.clone(), "stdout"));
    tokio::spawn(pump_stream(stderr, app.clone(), id.clone(), "stderr"));

    let (kill_tx, kill_rx) = tokio::sync::oneshot::channel();
    state.child_kill_senders.lock().unwrap().insert(id.clone(), kill_tx);
    state.child_pids.lock().unwrap().insert(id.clone(), pid);

    // Written only after the pumps are running and the child is registered,
    // in its own task, so a large prompt can't stall this command.
    if let (Some(input), Some(child_stdin)) = (stdin, child.stdin.take()) {
        tokio::spawn(feed_stdin(child_stdin, input));
    }

    let app_for_task = app.clone();
    let id_for_task = id.clone();
    tokio::spawn(async move {
        let status = tokio::select! {
            status = child.wait() => status,
            _ = kill_rx => {
                #[cfg(windows)]
                kill_tree(pid).await;
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

/// Used by Settings > AI: the resolved path of an AI agent CLI on PATH, or
/// None. The path's extension tells JS whether it is a `.cmd` shim. Note:
/// right after running an installer in the same session, this can still
/// report None - this already-running process keeps the PATH it inherited at
/// launch, so a restart is needed for a fresh install to be picked up.
#[tauri::command]
pub fn ai_cli_path(binary: String) -> Result<Option<String>, String> {
    if !AI_CLI_BINARIES.contains(&binary.as_str()) {
        return Err(format!("unknown AI CLI: {binary}"));
    }
    Ok(which::which(&binary).ok().map(|p| p.to_string_lossy().to_string()))
}

/// Binaries Settings > AI may probe. Must match the `binary` fields in
/// src/host/api/aiProviders.ts.
const AI_CLI_BINARIES: &[&str] = &["claude", "codex", "agy", "gemini", "copilot", "agent", "grok", "opencode"];

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn run_command_returns_exit_code_zero_and_stdout_for_a_successful_command() {
        let result = match run_command("cmd".to_string(), vec!["/c".to_string(), "echo".to_string(), "hi".to_string()], None, None).await {
            Ok(r) => r,
            Err(e) => panic!("expected Ok, got Err({e})"),
        };
        assert_eq!(result.code, 0);
        assert!(result.stdout.contains("hi"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn run_command_launches_a_cmd_shim_by_bare_name() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("stewrd-shim-test.cmd"), "@echo off\r\necho shim-ok\r\n").unwrap();
        let old = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![dir.path().to_path_buf()];
        paths.extend(std::env::split_paths(&old));
        std::env::set_var("PATH", std::env::join_paths(paths).unwrap());
        let result = run_command("stewrd-shim-test".to_string(), vec![], None, None).await.unwrap();
        std::env::set_var("PATH", old);
        assert_eq!(result.code, 0);
        assert!(result.stdout.contains("shim-ok"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn feed_stdin_delivers_a_multi_line_prompt_and_closes_the_pipe() {
        use std::process::Stdio;
        let mut cmd = build_command("findstr", &["^".to_string()], &None, &None);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped());
        let mut child = cmd.spawn().unwrap();
        tokio::spawn(feed_stdin(child.stdin.take().unwrap(), "line one \"quoted\" 100%\nline two\n".to_string()));
        let output = child.wait_with_output().await.unwrap();
        let text = String::from_utf8_lossy(&output.stdout);
        assert!(text.contains("line one \"quoted\" 100%") && text.contains("line two"), "got: {text}");
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn kill_tree_stops_the_grandchild_behind_a_cmd_launch() {
        use std::process::Stdio;
        let mut cmd = build_command("cmd", &["/c".to_string(), "ping -n 30 127.0.0.1 >nul".to_string()], &None, &None);
        cmd.stdout(Stdio::null());
        let mut child = cmd.spawn().unwrap();
        let pid = child.id().unwrap();
        tokio::time::sleep(Duration::from_millis(500)).await;
        kill_tree(pid).await;
        let status = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
        assert!(status.is_ok(), "process tree was not killed");
    }

    #[test]
    fn ai_cli_path_rejects_binaries_outside_the_allowlist() {
        assert!(ai_cli_path("powershell".to_string()).is_err());
        assert!(ai_cli_path("claude".to_string()).is_ok());
    }

    #[tokio::test]
    async fn run_command_errors_when_the_program_does_not_exist() {
        let err = match run_command("this-program-does-not-exist-anywhere".to_string(), vec![], None, None).await {
            Ok(_) => panic!("expected Err, got Ok"),
            Err(e) => e,
        };
        assert!(err.starts_with("failed to spawn"), "unexpected error: {err}");
    }
}
