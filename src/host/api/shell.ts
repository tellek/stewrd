import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOpts {
  cwd?: string;
  env?: Record<string, string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface SpawnHandle {
  pid: number;
  kill(): void;
  done: Promise<{ code: number }>;
}

export interface ShellApi {
  exec(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<ExecResult>;
  spawn(cmd: string, args: string[], opts?: SpawnOpts): SpawnHandle;
}

/** Host-internal spawn that can also pipe `stdin` to the child (then closes
 * it). Deliberately not part of ShellApi, so plugins don't get it - used by
 * ai.ts to hand prompts to CLIs that can't take them as argv (npm `.cmd`
 * shims reject multi-line arguments). */
export function spawnWithStdin(cmd: string, args: string[], opts: SpawnOpts | undefined, stdin?: string): SpawnHandle {
  // `pid` starts at -1 and is filled in once spawn_command resolves with
  // the real OS pid (the underlying invoke() is unavoidably async) -
  // mutated in place on the returned handle so callers see the real
  // value once the process has actually started.
  const state = { pid: -1 };

  const done = (async (): Promise<{ code: number }> => {
    const pid = await invoke<number>("spawn_command", { program: cmd, args, cwd: opts?.cwd, env: opts?.env, stdin });
    state.pid = pid;

    const unlistenOutput = await listen<{ stream: "stdout" | "stderr"; chunk: string }>(
      `process-output:${pid}`,
      (event) => {
        if (event.payload.stream === "stdout") opts?.onStdout?.(event.payload.chunk);
        else opts?.onStderr?.(event.payload.chunk);
      },
    );

    try {
      return await new Promise<{ code: number }>((resolve) => {
        listen<{ code: number }>(`process-exit:${pid}`, (event) => resolve(event.payload));
      });
    } finally {
      unlistenOutput();
    }
  })();

  return {
    get pid() {
      return state.pid;
    },
    kill: () => {
      if (state.pid !== -1) invoke("kill_command", { processId: String(state.pid) });
    },
    done,
  };
}

export function createShellApi(): ShellApi {
  return {
    exec: (cmd, args, opts) =>
      invoke<ExecResult>("run_command", { program: cmd, args, cwd: opts?.cwd, env: opts?.env }),

    spawn: (cmd, args, opts) => spawnWithStdin(cmd, args, opts),
  };
}
