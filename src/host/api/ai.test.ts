import { beforeEach, describe, expect, it, vi } from "vitest";
import { runHeadlessAi } from "./ai";
import { useAppStore } from "../state/appStore";

const mockSpawn = vi.fn();
vi.mock("./shell", () => ({
  spawnWithStdin: (...args: unknown[]) => mockSpawn(...args),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

/** Resolves `ai_cli_path` to the given path (or null) for any binary. */
function cliOnPath(path: string | null) {
  mockInvoke.mockImplementation(async (cmd: string) => (cmd === "ai_cli_path" ? path : undefined));
}

function makeSpawnHandle() {
  let resolveDone!: (v: { code: number }) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<{ code: number }>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  return { handle: { pid: 1, kill: vi.fn(), done }, resolveDone, rejectDone };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSpawn.mockReset();
  mockInvoke.mockReset();
  cliOnPath("C:\\bin\\claude.exe");
  useAppStore.setState({ aiProvider: "claude-cli", aiModels: {} });
});

describe("runHeadlessAi under the claude-cli provider", () => {
  it("builds args in order: model, allowedTools, disallowedTools, extraArgs, only when provided", async () => {
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("prompt", {
      model: "sonnet",
      allowedTools: ["WebSearch", "WebFetch"],
      disallowedTools: ["Bash", "Write"],
      extraArgs: ["--extra", "value"],
    });
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      [
        "-p",
        "prompt",
        "--model",
        "sonnet",
        "--allowedTools",
        "WebSearch,WebFetch",
        "--disallowedTools",
        "Bash,Write",
        "--extra",
        "value",
      ],
      expect.anything(),
      undefined,
    );
  });

  it("omits args for opts that weren't provided", async () => {
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("prompt", {});
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith("claude", ["-p", "prompt"], expect.anything(), undefined);
  });

  it("pipes the prompt on stdin when claude resolved to a .cmd shim, keeping extraArgs positional", async () => {
    cliOnPath("C:\\npm\\claude.cmd");
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("multi\nline", { extraArgs: ["harvest/a.md"] });
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith("claude", ["-p", "harvest/a.md"], expect.anything(), "multi\nline");
  });

  it("rejects with trimmed stderr on a non-zero exit code", async () => {
    const { handle, resolveDone } = makeSpawnHandle();
    mockSpawn.mockImplementation((_cmd, _args, opts) => {
      opts.onStderr("  something broke  ");
      return handle;
    });

    const h = runHeadlessAi("prompt");
    await flush();
    resolveDone({ code: 1 });

    await expect(h.done).rejects.toThrow("something broke");
  });

  it("rejects with a generic message on a non-zero exit code with no stderr", async () => {
    const { handle, resolveDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    await flush();
    resolveDone({ code: 7 });

    await expect(h.done).rejects.toThrow("claude exited with code 7");
  });

  it("rewrites an ENOENT-like spawn failure to the friendly CLI-not-found message", async () => {
    const { handle, rejectDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    await flush();
    rejectDone(new Error("Error: ENOENT"));

    await expect(h.done).rejects.toThrow("Couldn't launch the claude CLI on PATH");
  });

  it("does not mislabel a batch-file argument error as CLI-not-found", async () => {
    const { handle, rejectDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    await flush();
    rejectDone(new Error("batch file arguments are invalid for claude"));

    await expect(h.done).rejects.toThrow("batch file arguments are invalid");
  });

  it("passes through a rejection that doesn't match the not-found regex unchanged", async () => {
    const { handle, rejectDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    await flush();
    rejectDone(new Error("some other failure"));

    await expect(h.done).rejects.toThrow("some other failure");
  });

  it("rejects with the not-found message when the CLI isn't on PATH", async () => {
    cliOnPath(null);
    const h = runHeadlessAi("prompt");
    await expect(h.done).rejects.toThrow("Couldn't launch the claude CLI on PATH");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("runHeadlessAi under other CLI providers", () => {
  it("sends the codex prompt on stdin with a read-only sandbox", async () => {
    useAppStore.setState({ aiProvider: "openai-cli" });
    cliOnPath("C:\\npm\\codex.cmd");
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("hello");
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "-s", "read-only", "--skip-git-repo-check", "--color", "never", "-"],
      expect.anything(),
      "hello",
    );
  });

  it("falls back from agy to gemini when only gemini is installed", async () => {
    useAppStore.setState({ aiProvider: "gemini-cli" });
    mockInvoke.mockImplementation(async (_cmd: string, args: { binary: string }) =>
      args.binary === "gemini" ? "C:\\npm\\gemini.cmd" : null,
    );
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("hi");
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith("gemini", ["-p", "hi"], expect.anything(), undefined);
  });

  it("rejects tool-use options before spawning anything", async () => {
    useAppStore.setState({ aiProvider: "grok-cli" });
    const h = runHeadlessAi("hi", { allowedTools: ["WebSearch"] });

    await expect(h.done).rejects.toThrow("doesn't support tool use");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not forward a Claude model alias to a non-Claude CLI", async () => {
    useAppStore.setState({ aiProvider: "copilot-cli" });
    cliOnPath("C:\\bin\\copilot.exe");
    mockSpawn.mockReturnValue(makeSpawnHandle().handle);

    runHeadlessAi("hi", { model: "sonnet" });
    await flush();

    expect(mockSpawn).toHaveBeenCalledWith(
      "copilot",
      ["-p", "hi", "-s", "--deny-tool", "shell"],
      expect.anything(),
      undefined,
    );
  });

  it("kills the process tree handle once spawned", async () => {
    const { handle } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);
    const h = runHeadlessAi("hi");
    await flush();

    h.kill();

    expect(handle.kill).toHaveBeenCalled();
  });
});
