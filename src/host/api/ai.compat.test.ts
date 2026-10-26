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
  useAppStore.setState({ aiProvider: "openai-api", aiModels: {}, aiTiers: {} });
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

describe("effort tiers under API providers", () => {
  const compatCall = () => mockInvoke.mock.calls.find((c) => c[0] === "ai_run_openai_compat")![1];

  it("sends the built-in tier effort with the default model", async () => {
    runHeadlessAi("hello", { effort: "high" });
    await flush();

    expect(compatCall()).toMatchObject({ model: "gpt-5", effort: "high" });
  });

  it("keeps a model typed in Settings and withholds built-in effort", async () => {
    useAppStore.setState({ aiModels: { openai: "gpt-4.1" } });
    runHeadlessAi("hello", { effort: "medium" });
    await flush();

    expect(compatCall()).toMatchObject({ model: "gpt-4.1" });
    expect(compatCall().effort).toBeUndefined();
  });

  it("applies a user tier override over the Settings model, including its effort", async () => {
    useAppStore.setState({
      aiModels: { openai: "gpt-4.1" },
      aiTiers: { openai: { low: { model: "gpt-5-mini", effort: "low" } } },
    });
    runHeadlessAi("hello", { effort: "low" });
    await flush();

    expect(compatCall()).toMatchObject({ model: "gpt-5-mini", effort: "low" });
  });

  it("sends no effort when the caller asked for none", async () => {
    runHeadlessAi("hello");
    await flush();

    expect(compatCall().effort).toBeUndefined();
  });
});
