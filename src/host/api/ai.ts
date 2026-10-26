import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { spawnWithStdin, type SpawnHandle } from "./shell";
import { useAppStore } from "../state/appStore";
import { normalizeAiProvider, parseAiProvider, type AiProviderDef, type ApiSpec, type CliSpec } from "./aiProviders";

export interface HeadlessAiOpts {
  /** Claude model alias ("sonnet", "opus", "haiku") or a full model id. On a
   * non-Claude provider a Claude alias is ignored and that provider's
   * configured model is used instead. */
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Extra raw CLI args appended after the built-in ones (e.g. notepad's
   * harvester needs `--permission-mode acceptEdits` plus positional file
   * paths). Agent/tool-use options - only meaningful under the Claude CLI
   * provider; every other provider rejects them. */
  extraArgs?: string[];
  /** Working directory for the spawned process - callers choose this
   * explicitly (e.g. a temp dir so `claude` doesn't pick up this repo's own
   * CLAUDE.md/project settings, or a plugin's own sandboxed folder). Purely
   * a process-isolation detail, not a tool capability - has no effect (and
   * is not an error) under the API-key providers. */
  cwd?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface HeadlessAiHandle {
  /** The OS pid for CLI providers (-1 until the process has started); always
   * -1 for API-key providers (there is no OS process - it's a direct HTTP call). */
  readonly pid: number;
  kill(): void;
  /** Resolves with the full accumulated stdout on a clean exit; rejects with
   * a stderr-aware Error on a non-zero exit or spawn failure. */
  done: Promise<string>;
}

const CLAUDE_ALIASES = new Set(["sonnet", "opus", "haiku"]);

function hasAgentOpts(opts: HeadlessAiOpts): boolean {
  return Boolean(opts.allowedTools?.length || opts.disallowedTools?.length || opts.extraArgs?.length);
}

function rejectedHandle(message: string): HeadlessAiHandle {
  return { pid: -1, kill: () => {}, done: Promise.reject(new Error(message)) };
}

function noToolUseMessage(def: AiProviderDef): string {
  return `${def.label} doesn't support tool use - switch to Claude (CLI) in Settings > AI for this feature.`;
}

async function findBinary(names: string[]): Promise<{ name: string; path: string } | null> {
  for (const name of names) {
    const path = await invoke<string | null>("ai_cli_path", { binary: name });
    if (path) return { name, path };
  }
  return null;
}

/** CLI mode: spawns the provider's agent CLI headlessly. The prompt goes on
 * stdin instead of argv when the CLI wants it that way, or when a CLI that
 * normally takes it as an argument resolved to an npm `.cmd` shim (which
 * can't take multi-line arguments). */
function runHeadlessCli(def: AiProviderDef, cli: CliSpec, prompt: string, opts: HeadlessAiOpts): HeadlessAiHandle {
  if (!cli.supportsAgentOpts && hasAgentOpts(opts)) return rejectedHandle(noToolUseMessage(def));

  let stdout = "";
  let stderr = "";
  let inner: SpawnHandle | null = null;
  let killed = false;

  const done = (async (): Promise<string> => {
    const binary = await findBinary(cli.binaries);
    if (!binary) {
      throw new Error(`Couldn't launch the ${cli.binaries[0]} CLI on PATH. Install it from Settings > AI.`);
    }
    if (killed) throw new Error("Cancelled");

    const isShim = /\.(cmd|bat)$/i.test(binary.path);
    const viaStdin = cli.promptVia === "stdin" || Boolean(cli.stdinWhenShim && isShim);
    const args = cli.buildArgs({
      binary: binary.name,
      prompt,
      viaStdin,
      model: cli.supportsAgentOpts ? opts.model : undefined,
      allowedTools: opts.allowedTools,
      disallowedTools: opts.disallowedTools,
      extraArgs: opts.extraArgs,
    });

    inner = spawnWithStdin(
      binary.name,
      args,
      {
        cwd: opts.cwd,
        onStdout: (chunk) => {
          stdout += chunk;
          opts.onStdout?.(chunk);
        },
        onStderr: (chunk) => {
          stderr += chunk;
          opts.onStderr?.(chunk);
        },
      },
      viaStdin ? prompt : undefined,
    );

    const { code } = await inner.done;
    if (code !== 0) {
      throw new Error(
        `${stderr.trim() || `${binary.name} exited with code ${code}`}\n\nIf this is a sign-in problem, see the login steps in Settings > AI.`,
      );
    }
    return stdout;
  })().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (/program not found|os error 2|ENOENT/i.test(message)) {
      throw new Error(`Couldn't launch the ${cli.binaries[0]} CLI on PATH. Install it from Settings > AI.`);
    }
    throw err;
  });

  return {
    get pid() {
      return inner?.pid ?? -1;
    },
    kill: () => {
      killed = true;
      inner?.kill();
    },
    done,
  };
}

/** API-key mode: a direct HTTP call from Rust (ai_anthropic.rs for Claude,
 * ai_openai_compat.rs for everything else), with no agentic tool-use loop.
 * Reuses the same process-output:<id>/process-exit:<id> event contract
 * shell.rs's spawn_command uses, but both listeners must be registered and
 * *awaited* before invoking the Rust command - unlike shell.ts's spawn,
 * which is only safe to listen-after-invoke because the id there comes back
 * from Rust after the streaming task has already started; here the id is
 * generated client-side, so listening first is required, not incidental. */
function runHttpApi(def: AiProviderDef, api: ApiSpec, prompt: string, opts: HeadlessAiOpts): HeadlessAiHandle {
  if (hasAgentOpts(opts)) return rejectedHandle(noToolUseMessage(def));

  const anthropic = api.kind === "anthropic";
  const cancelCommand = anthropic ? "ai_cancel_anthropic" : "ai_cancel_openai_compat";
  const configured = useAppStore.getState().aiModels[def.id];
  const callerModel = opts.model && !(!anthropic && CLAUDE_ALIASES.has(opts.model)) ? opts.model : undefined;
  const model = callerModel ?? (configured || api.defaultModel);
  const runArgs = (id: string) =>
    anthropic
      ? invoke("ai_run_anthropic", { id, prompt, model: model || undefined })
      : invoke("ai_run_openai_compat", { id, provider: def.id, model, prompt });

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
          else reject(new Error(stderr.trim() || `${def.label} API request exited with code ${event.payload.code}`));
        }),
      ]).then(([unlistenOut, unlistenEx]) => {
        unlistenOutput = unlistenOut;
        unlistenExit = unlistenEx;

        runArgs(id)
          .then(() => {
            invokeSettled = true;
            if (cancelRequested) invoke(cancelCommand, { id }).catch(() => {});
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
      if (invokeSettled) invoke(cancelCommand, { id }).catch(() => {});
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
  const { def, mode } = parseAiProvider(normalizeAiProvider(useAppStore.getState().aiProvider));
  return mode === "cli" ? runHeadlessCli(def, def.cli!, prompt, opts) : runHttpApi(def, def.api!, prompt, opts);
}

export interface AiApi {
  run(prompt: string, opts?: HeadlessAiOpts): HeadlessAiHandle;
}

export function createAiApi(): AiApi {
  return { run: runHeadlessAi };
}
