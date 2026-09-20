import { createShellApi } from "./shell";

export interface HeadlessAiOpts {
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Extra raw CLI args appended after the built-in ones (e.g. notepad's
   * harvester needs `--permission-mode acceptEdits` plus positional file
   * paths). */
  extraArgs?: string[];
  /** Working directory for the spawned process - callers choose this
   * explicitly (e.g. a temp dir so `claude` doesn't pick up this repo's own
   * CLAUDE.md/project settings, or a plugin's own sandboxed folder). */
  cwd?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface HeadlessAiHandle {
  readonly pid: number;
  kill(): void;
  /** Resolves with the full accumulated stdout on a clean exit; rejects with
   * a stderr-aware Error on a non-zero exit or spawn failure. */
  done: Promise<string>;
}

/** The single launch point for headless AI CLI invocations in this app - the
 * "which AI" is hardcoded to spawning the `claude` CLI for now, but isolated
 * behind this one function so swapping providers later means changing only
 * this file. Every in-repo caller that shells out to `claude` (palette
 * generation, git-tracker's "ask Claude", notepad's wiki harvester) goes
 * through this instead of calling `shell.spawn("claude", ...)` directly. */
export function runHeadlessAi(prompt: string, opts: HeadlessAiOpts = {}): HeadlessAiHandle {
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

export interface AiApi {
  run(prompt: string, opts?: HeadlessAiOpts): HeadlessAiHandle;
}

export function createAiApi(): AiApi {
  return { run: runHeadlessAi };
}
