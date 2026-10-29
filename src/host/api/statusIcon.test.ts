/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusIconApi } from "./statusIcon";
import { useAppStore } from "../state/appStore";
import { createLeaf } from "../state/paneTree";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function seedPlugin(id: string) {
  useAppStore.setState({
    plugins: {
      [id]: {
        manifest: { id, name: id, icon: "", entry: "", description: "", apiVersion: "1", background: false },
        status: "idle",
        dir: id,
        category: "Other",
      },
    },
  });
}

/** Shows `pluginId` in the active pane of the plugin view. */
function focusPlugin(pluginId: string | null) {
  const leaf = createLeaf(pluginId);
  useAppStore.setState({ paneTree: leaf, activePaneId: leaf.id, view: "plugin" });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createStatusIconApi", () => {
  it("get() falls back to idle for a plugin id that was never set", () => {
    useAppStore.setState({ plugins: {} });
    expect(createStatusIconApi("never-set").get()).toBe("idle");
  });

  it("get() reflects a status previously set via set()", () => {
    seedPlugin("p");
    focusPlugin(null);
    const api = createStatusIconApi("p");
    api.set("warning");
    expect(api.get()).toBe("warning");
  });

  it("shows the worst status across sources: error > warning > in-progress > success > idle", () => {
    seedPlugin("multi");
    focusPlugin(null);
    const api = createStatusIconApi("multi");
    api.set("success", undefined, "a");
    expect(api.get()).toBe("success");
    api.set("in-progress", "saving", "b");
    expect(api.get()).toBe("in-progress");
    api.set("warning", undefined, "c");
    expect(api.get()).toBe("warning");
    api.set("error", "boom", "d");
    expect(api.get()).toBe("error");
    expect(useAppStore.getState().plugins.multi.statusTooltip).toBe("boom");
    api.set("idle", undefined, "d");
    expect(api.get()).toBe("warning");
    api.set("idle", undefined, "c");
    api.set("idle", undefined, "b");
    expect(api.get()).toBe("success");
  });

  it("holds success until the plugin is focused, then fades to idle after 3s", () => {
    seedPlugin("held");
    focusPlugin("other");
    const api = createStatusIconApi("held");
    api.set("success");

    vi.advanceTimersByTime(10_000);
    expect(api.get()).toBe("success"); // not focused: held indefinitely

    focusPlugin("held");
    vi.advanceTimersByTime(2_900);
    expect(api.get()).toBe("success");
    vi.advanceTimersByTime(200);
    expect(api.get()).toBe("idle");
  });

  it("cancels the countdown when focus leaves and restarts it on return", () => {
    seedPlugin("blink");
    focusPlugin("blink");
    const api = createStatusIconApi("blink");
    api.set("success");
    vi.advanceTimersByTime(2_000);
    focusPlugin("elsewhere");
    vi.advanceTimersByTime(10_000);
    expect(api.get()).toBe("success");
    focusPlugin("blink");
    vi.advanceTimersByTime(2_900);
    expect(api.get()).toBe("success"); // the 3s restarted from zero
    vi.advanceTimersByTime(200);
    expect(api.get()).toBe("idle");
  });

  it("does not fade warning or error", () => {
    seedPlugin("sticky");
    focusPlugin("sticky");
    const api = createStatusIconApi("sticky");
    api.set("error");
    vi.advanceTimersByTime(60_000);
    expect(api.get()).toBe("error");
  });

  it("a new activation drops sources left by the previous generation", () => {
    seedPlugin("reload");
    focusPlugin(null);
    createStatusIconApi("reload").set("error", undefined, "old-source");
    const next = createStatusIconApi("reload");
    next.set("idle");
    expect(next.get()).toBe("idle");
  });
});
