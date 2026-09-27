import { describe, expect, it, vi, beforeEach } from "vitest";
import { runHeadlessAi } from "./ai";
import { useAppStore } from "../state/appStore";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

type Handler<T> = (event: { payload: T }) => void;
const listeners = new Map<string, Handler<unknown>>();
const unlistenSpies = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: Handler<unknown>) => {
    listeners.set(event, handler);
    const unlisten = vi.fn();
    unlistenSpies.set(event, unlisten);
    return Promise.resolve(unlisten);
  },
}));

function emit(event: string, payload: unknown) {
  listeners.get(event)?.({ payload });
}

beforeEach(() => {
  listeners.clear();
  unlistenSpies.clear();
  mockInvoke.mockReset();
  useAppStore.setState({ aiProvider: "anthropic-api" });
});

describe("runHeadlessAi under the anthropic-api provider", () => {
  it("rejects immediately without calling invoke when tool-use options are passed", async () => {
    const h = runHeadlessAi("prompt", { allowedTools: ["WebSearch"] });

    await expect(h.done).rejects.toThrow("doesn't support tool use");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not reject on cwd alone - it's a no-op process-isolation hint under this provider", async () => {
    mockInvoke.mockResolvedValue(undefined);
    runHeadlessAi("prompt", { cwd: "/tmp/whatever" });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledWith("ai_run_anthropic", expect.objectContaining({ prompt: "prompt" }));
  });

  it("streams stdout chunks and resolves done on a code:0 process-exit", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const onStdout = vi.fn();
    const h = runHeadlessAi("prompt", { onStdout });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const id = [...listeners.keys()][0]!.split(":")[1];
    emit(`process-output:${id}`, { stream: "stdout", chunk: "hello " });
    emit(`process-output:${id}`, { stream: "stdout", chunk: "world" });
    emit(`process-exit:${id}`, { code: 0 });

    expect(onStdout).toHaveBeenCalledWith("hello ");
    await expect(h.done).resolves.toBe("hello world");
  });

  it("rejects done with the stderr text on a non-zero process-exit", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const h = runHeadlessAi("prompt");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const id = [...listeners.keys()][0]!.split(":")[1];
    emit(`process-output:${id}`, { stream: "stderr", chunk: "boom" });
    emit(`process-exit:${id}`, { code: 1 });

    await expect(h.done).rejects.toThrow("boom");
  });

  it("rejects done directly when invoke itself rejects (e.g. no key configured)", async () => {
    mockInvoke.mockRejectedValue(new Error("No Anthropic API key configured"));
    const h = runHeadlessAi("prompt");

    await expect(h.done).rejects.toThrow("No Anthropic API key configured");
  });

  it("sends a cancel once invoke has resolved when kill() is called", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const h = runHeadlessAi("prompt");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    mockInvoke.mockClear();

    h.kill();
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledWith("ai_cancel_anthropic", expect.objectContaining({}));
  });
});
