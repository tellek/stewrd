import { beforeEach, describe, expect, it, vi } from "vitest";
import { runHeadlessAi } from "./ai";
import { useAppStore } from "../state/appStore";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(vi.fn()) }));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  useAppStore.setState({ aiProvider: "openai-api", aiModels: {} });
});

describe("runHeadlessAi under OpenAI-compatible API providers", () => {
  it("calls ai_run_openai_compat with the provider id and its default model, and never a base URL", async () => {
    runHeadlessAi("hello");
    await flush();

    const call = mockInvoke.mock.calls.find((c) => c[0] === "ai_run_openai_compat")!;
    expect(call[1]).toMatchObject({ provider: "openai", model: "gpt-5", prompt: "hello" });
    expect(call[1]).not.toHaveProperty("baseUrl");
    expect(call[1]).not.toHaveProperty("base_url");
  });

  it("uses the model configured in Settings", async () => {
    useAppStore.setState({ aiProvider: "grok-api", aiModels: { grok: "grok-custom" } });
    runHeadlessAi("hello");
    await flush();

    expect(mockInvoke.mock.calls.find((c) => c[0] === "ai_run_openai_compat")![1]).toMatchObject({
      provider: "grok",
      model: "grok-custom",
    });
  });

  it("ignores a Claude model alias from the caller", async () => {
    runHeadlessAi("hello", { model: "sonnet" });
    await flush();

    expect(mockInvoke.mock.calls.find((c) => c[0] === "ai_run_openai_compat")![1]).toMatchObject({ model: "gpt-5" });
  });

  it("passes the custom provider through with an empty model for Rust to reject", async () => {
    useAppStore.setState({ aiProvider: "custom-api" });
    runHeadlessAi("hello");
    await flush();

    expect(mockInvoke.mock.calls.find((c) => c[0] === "ai_run_openai_compat")![1]).toMatchObject({
      provider: "custom",
      model: "",
    });
  });

  it("rejects tool-use options without invoking", async () => {
    const h = runHeadlessAi("hello", { extraArgs: ["x"] });
    await expect(h.done).rejects.toThrow("doesn't support tool use");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("cancels through ai_cancel_openai_compat once the run invoke has settled", async () => {
    const h = runHeadlessAi("hello");
    await flush();
    mockInvoke.mockClear();

    h.kill();

    expect(mockInvoke).toHaveBeenCalledWith("ai_cancel_openai_compat", expect.anything());
  });
});
