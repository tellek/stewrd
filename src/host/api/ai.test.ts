import { describe, expect, it, vi } from "vitest";
import { runHeadlessAi } from "./ai";

const mockSpawn = vi.fn();
vi.mock("./shell", () => ({ createShellApi: () => ({ spawn: mockSpawn, exec: vi.fn() }) }));

function makeSpawnHandle() {
  let resolveDone!: (v: { code: number }) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<{ code: number }>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  return { handle: { pid: 1, kill: vi.fn(), done }, resolveDone, rejectDone };
}

describe("runHeadlessAi", () => {
  it("builds args in order: model, allowedTools, disallowedTools, extraArgs, only when provided", () => {
    const { handle } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    runHeadlessAi("prompt", {
      model: "sonnet",
      allowedTools: ["WebSearch", "WebFetch"],
      disallowedTools: ["Bash", "Write"],
      extraArgs: ["--extra", "value"],
    });

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
    );
  });

  it("omits args for opts that weren't provided", () => {
    const { handle } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    runHeadlessAi("prompt", {});

    expect(mockSpawn).toHaveBeenCalledWith("claude", ["-p", "prompt"], expect.anything());
  });

  it("rejects with trimmed stderr on a non-zero exit code", async () => {
    const { handle, resolveDone } = makeSpawnHandle();
    mockSpawn.mockImplementation((_cmd, _args, opts) => {
      opts.onStderr("  something broke  ");
      return handle;
    });

    const h = runHeadlessAi("prompt");
    resolveDone({ code: 1 });

    await expect(h.done).rejects.toThrow("something broke");
  });

  it("rejects with a generic message on a non-zero exit code with no stderr", async () => {
    const { handle, resolveDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    resolveDone({ code: 7 });

    await expect(h.done).rejects.toThrow("claude exited with code 7");
  });

  it("rewrites an ENOENT-like spawn failure to the friendly CLI-not-found message", async () => {
    const { handle, rejectDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    rejectDone(new Error("Error: ENOENT"));

    await expect(h.done).rejects.toThrow("Couldn't launch the claude CLI on PATH");
  });

  it("passes through a rejection that doesn't match the ENOENT-detection regex unchanged", async () => {
    const { handle, rejectDone } = makeSpawnHandle();
    mockSpawn.mockReturnValue(handle);

    const h = runHeadlessAi("prompt");
    rejectDone(new Error("some other failure"));

    await expect(h.done).rejects.toThrow("some other failure");
  });
});
