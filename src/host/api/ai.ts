import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createShellApi } from "./shell";
import { useAppStore } from "../state/appStore";

export interface HeadlessAiOpts {
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Extra raw CLI args appended after the built-in ones (e.g. notepad's
   * harvester needs `--permission-mode acceptEdits` plus positional file
   * paths). Agent/tool-use options - only meaningful under the
   * "claude-subscription" provider; see runAnthropicApi below. */
  extraArgs?: string[];
  /** Working directory for the spawned process - callers choose this
   * explicitly (e.g. a temp dir so `claude` doesn't pick up this repo's own
   * CLAUDE.md/project settings, or a plugin's own sandboxed folder). Purely
   * a process-isolation detail, not a tool capability - has no effect (and
   * is not an error) under the "anthropic-api" provider. */
  cwd?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface HeadlessAiHandle {
  /** The OS pid for the "claude-subscription" provider; always -1 for
   * "anthropic-api" (there is no OS process - it's a direct HTTP call). */
  readonly pid: number;
  kill(): void;
  /** Resolves with the full accumulated stdout on a clean exit; rejects with
   * a stderr-aware Error on a non-zero exit or spawn failure. */
  done: Promise<string>;
}

function runHeadlessClaudeCli(prompt: string, opts: HeadlessAiOpts): HeadlessAiHandle {
  const shell = createShellApi();
  let stdout = "";
  let stderr = "";

  const args = ["-p", prompt];
  if (opts.model) args.push("--model", opts.model);
  if (opts.allowedTools?.length) args.push("--allowedTools", opts.allowedTools.join(","));
  if (opts.disallowedTools?.length) args.push("--disallowedTools", opts.disallowedTools.join(","));
  if (opts.extraArgs?.length) args.push(...opts.extraArgs);

  const handle = shell.spawn("claude", args, {
    cwd: opts.cwd,
    onStdout: (chunk) => {
      stdout += chunk;
      opts.onStdout?.(chunk);
    },
    onStderr: (chunk) => {
      stderr += chunk;
      opts.onStderr?.(chunk);
    },
  });

  const done = handle.done
    .then(({ code }) => {
      if (code !== 0) throw new Error(stderr.trim() || `claude exited with code ${code}`);
      return stdout;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (/failed to spawn|program not found|os error 2|ENOENT/i.test(message)) {
        throw new Error(
          "Couldn't launch the claude CLI on PATH. If it's installed via npm as a .cmd shim, this app can't currently launch it directly.",
        );
      }
      throw err;
    });

  return {
    get pid() {
      return handle.pid;
    },
    kill: handle.kill,
    done,
  };
}

/** The "anthropic-api" provider: a direct HTTP call to the Anthropic Messages
 * API via src-tauri/src/commands/ai_anthropic.rs, with no agentic tool-use
 * loop - see HeadlessAiOpts' allowedTools/disallowedTools/extraArgs docs.
 * Reuses the same process-output:<id>/process-exit:<id> event contract
 * shell.rs's spawn_command uses, but both listeners must be registered and
 * *awaited* before invoking the Rust command - unlike shell.ts's spawn,
 * which is only safe to listen-after-invoke because the id there comes back
 * from Rust after the streaming task has already started; here the id is
 * generated client-side, so listening first is required, not incidental. */
function runAnthropicApi(prompt: string, opts: HeadlessAiOpts): HeadlessAiHandle {
  if (opts.allowedTools?.length || opts.disallowedTools?.length || opts.extraArgs?.length) {
    const message =
      "The Anthropic API key provider doesn't support tool use - switch to Claude Subscription in Settings > AI for this feature.";
    return {
      pid: -1,
      kill: () => {},
      done: Promise.reject(new Error(message)),
    };
  }

  const id = crypto.randomUUID();
  let stdout = "";
  let stderr = "";
  let cancelRequested = false;
  let invokeSettled = false;

  const done = (async (): Promise<string> => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    const unlistenBoth = () => {
      unlistenOutput?.();
      unlistenExit?.();
    };

    const exitPromise = new Promise<string>((resolve, reject) => {
      Promise.all([
        listen<{ stream: "stdout" | "stderr"; chunk: string }>(`process-output:${id}`, (event) => {
          if (event.payload.stream === "stdout") {
            stdout += event.payload.chunk;
            opts.onStdout?.(event.payload.chunk);
          } else {
            stderr += event.payload.chunk;
            opts.onStderr?.(event.payload.chunk);
          }
        }),
        listen<{ code: number }>(`process-exit:${id}`, (event) => {
          unlistenBoth();
          if (event.payload.code === 0) resolve(stdout);
          else reject(new Error(stderr.trim() || `Anthropic API request exited with code ${event.payload.code}`));
        }),
      ]).then(([unlistenOut, unlistenEx]) => {
        unlistenOutput = unlistenOut;
        unlistenExit = unlistenEx;

        invoke("ai_run_anthropic", { id, prompt, model: opts.model })
          .then(() => {
            invokeSettled = true;
            if (cancelRequested) invoke("ai_cancel_anthropic", { id }).catch(() => {});
          })
          .catch((err) => {
            invokeSettled = true;
            unlistenBoth();
            reject(err instanceof Error ? err : new Error(String(err)));
          });
      });
    });

    return exitPromise;
  })();

  return {
    pid: -1,
    kill: () => {
      cancelRequested = true;
      if (invokeSettled) invoke("ai_cancel_anthropic", { id }).catch(() => {});
    },
    done,
  };
}

/** The single launch point for headless AI invocations in this app - which
 * provider handles a call is decided per-request by the current
 * Settings > AI choice (host/state/hostSettings.ts's aiProvider), so
 * switching providers there transparently changes what every plugin's
 * ctx.api.ai.run call (and host features like palette generation) actually
 * does, with no caller-side change needed. Every in-repo caller that wants
 * an AI response (palette generation, git-tracker's "ask Claude") goes
 * through this instead of calling `shell.spawn("claude", ...)` or an HTTP
 * client directly. */
export function runHeadlessAi(prompt: string, opts: HeadlessAiOpts = {}): HeadlessAiHandle {
  const provider = useAppStore.getState().aiProvider;
  return provider === "anthropic-api" ? runAnthropicApi(prompt, opts) : runHeadlessClaudeCli(prompt, opts);
}

export interface AiApi {
  run(prompt: string, opts?: HeadlessAiOpts): HeadlessAiHandle;
}

export function createAiApi(): AiApi {
  return { run: runHeadlessAi };
}
