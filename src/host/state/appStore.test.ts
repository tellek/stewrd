import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { resolvePalette, useAppStore, type PluginSidebarEntry } from "./appStore";
import { premadePalettes } from "../../shared/palette";
import { DEFAULT_CATEGORIES, LAYOUTS_CATEGORY_ID } from "../../shared/category";
import { createLeaf } from "./paneTree";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

function mockInvokeDefaults() {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "storage_get_all") return Promise.resolve({});
    if (cmd === "read_log_lines") return Promise.resolve([]);
    if (cmd === "storage_set") return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
}

function manifest(id: string): PluginManifest {
  return {
    id,
    name: id,
    icon: "",
    entry: "index.js",
    description: "",
    apiVersion: "1",
    background: false,
  };
}

function pluginEntry(id: string): PluginSidebarEntry {
  return { manifest: manifest(id), status: "idle", dir: id, category: "Other" };
}

describe("resolvePalette", () => {
  it("resolves a premade palette by id", () => {
    expect(resolvePalette("light", [])).toBe(premadePalettes[1].colors);
  });

  it("resolves a custom palette by id", () => {
    const custom = { id: "mine", name: "Mine", colors: premadePalettes[0].colors };
    expect(resolvePalette("mine", [custom])).toBe(custom.colors);
  });

  it("falls back to the first premade palette (Dark) for an unknown id", () => {
    expect(resolvePalette("deleted-custom-palette", [])).toBe(premadePalettes[0].colors);
  });
});

describe("appendRemoteLogLine", () => {
  it("returns null (drops the line) for malformed JSON", () => {
    useAppStore.setState({ statusLog: [] });
    useAppStore.getState().appendRemoteLogLine("not json");
    expect(useAppStore.getState().statusLog).toEqual([]);
  });

  it("drops a line missing ts/level/message", () => {
    useAppStore.setState({ statusLog: [] });
    useAppStore.getState().appendRemoteLogLine(JSON.stringify({ ts: 1, level: "success" }));
    expect(useAppStore.getState().statusLog).toEqual([]);
  });

  it("maps a null pluginId to undefined", () => {
    useAppStore.setState({ statusLog: [] });
    useAppStore
      .getState()
      .appendRemoteLogLine(JSON.stringify({ ts: 1, level: "success", message: "hi", pluginId: null }));
    expect(useAppStore.getState().statusLog[0].pluginId).toBeUndefined();
  });

  it("does not add a duplicate entry for the same disk log line", () => {
    useAppStore.setState({ statusLog: [] });
    const line = JSON.stringify({ ts: 1, level: "success", message: "hi", pluginId: null });
    useAppStore.getState().appendRemoteLogLine(line);
    useAppStore.getState().appendRemoteLogLine(line);
    expect(useAppStore.getState().statusLog.length).toBe(1);
  });

  it("trims the log to MAX_LOG_ENTRIES (500) via logMessage", () => {
    useAppStore.setState({ statusLog: [] });
    for (let i = 0; i < 505; i++) {
      useAppStore.getState().logMessage("success", `msg-${i}`);
    }
    expect(useAppStore.getState().statusLog.length).toBe(500);
    expect(useAppStore.getState().statusLog[0].message).toBe("msg-5");
  });
});

describe("fadeToast", () => {
  it("adds an id to fadingToastIds", () => {
    useAppStore.setState({ fadingToastIds: [] });
    useAppStore.getState().fadeToast(1);
    expect(useAppStore.getState().fadingToastIds).toEqual([1]);
  });

  it("is a no-op when the id is already fading", () => {
    useAppStore.setState({ fadingToastIds: [1] });
    const before = useAppStore.getState().fadingToastIds;
    useAppStore.getState().fadeToast(1);
    expect(useAppStore.getState().fadingToastIds).toBe(before);
  });
});

describe("hydrateHostSettings", () => {
  it("appends the Layouts category when absent from loaded settings", async () => {
    mockInvokeDefaults();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "storage_get_all") {
        return Promise.resolve({ categories: DEFAULT_CATEGORIES.filter((c) => c.id !== LAYOUTS_CATEGORY_ID) });
      }
      return Promise.resolve(undefined);
    });
    useAppStore.setState({ categories: DEFAULT_CATEGORIES });
    await useAppStore.getState().hydrateHostSettings();
    expect(useAppStore.getState().categories.some((c) => c.id === LAYOUTS_CATEGORY_ID)).toBe(true);
  });
});

describe("hydrateStatusLog", () => {
  it("merges disk log lines into statusLog (one-shot per test file)", async () => {
    mockInvokeDefaults();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_log_lines") {
        return Promise.resolve([JSON.stringify({ ts: 1, level: "success", message: "from disk", pluginId: null })]);
      }
      return Promise.resolve(undefined);
    });
    useAppStore.setState({ statusLog: [] });
    await useAppStore.getState().hydrateStatusLog();
    expect(useAppStore.getState().statusLog.some((e) => e.message === "from disk")).toBe(true);
  });
});

describe("setPlugins", () => {
  it("keeps an existing plugin's status and gives a new plugin id status idle", () => {
    useAppStore.setState({ plugins: { a: { ...pluginEntry("a"), status: "error" } } });
    useAppStore.getState().setPlugins([pluginEntry("a"), pluginEntry("b")]);
    const plugins = useAppStore.getState().plugins;
    expect(plugins.a.status).toBe("error");
    expect(plugins.b.status).toBe("idle");
  });
});

describe("focusOrOpenPlugin", () => {
  it("focuses the pane a plugin is already open in instead of opening it in a second pane", () => {
    const leafA = createLeaf("pluginA");
    const leafB = createLeaf(null);
    const tree = { type: "split" as const, id: "split1", direction: "row" as const, children: [leafA, leafB] as [typeof leafA, typeof leafB], sizes: [50, 50] as [number, number] };
    useAppStore.setState({ paneTree: tree, activePaneId: leafB.id, view: "settings" });
    useAppStore.getState().focusOrOpenPlugin(leafB.id, "pluginA");
    expect(useAppStore.getState().activePaneId).toBe(leafA.id);
    expect(useAppStore.getState().view).toBe("plugin");
    expect(useAppStore.getState().paneTree).toBe(tree);
  });

  it("just switches out of settings when the plugin is already in the target pane", () => {
    const leafA = createLeaf("pluginA");
    useAppStore.setState({ paneTree: leafA, activePaneId: leafA.id, view: "settings" });
    useAppStore.getState().focusOrOpenPlugin(leafA.id, "pluginA");
    expect(useAppStore.getState().activePaneId).toBe(leafA.id);
    expect(useAppStore.getState().view).toBe("plugin");
  });
});

describe("setPaneTool / splitPane", () => {
  it("setPaneTool always opens a new instance in the target pane, even if the plugin is open elsewhere", () => {
    const leafA = createLeaf("pluginA");
    const leafB = createLeaf(null);
    const tree = { type: "split" as const, id: "split1", direction: "row" as const, children: [leafA, leafB] as [typeof leafA, typeof leafB], sizes: [50, 50] as [number, number] };
    useAppStore.setState({ paneTree: tree, activePaneId: leafA.id, view: "settings" });
    useAppStore.getState().setPaneTool(leafB.id, "pluginA");
    expect(useAppStore.getState().activePaneId).toBe(leafB.id);
    expect(useAppStore.getState().view).toBe("plugin");
    const result = useAppStore.getState().paneTree;
    if (result.type !== "split") throw new Error("expected split");
    expect(result.children[0]).toMatchObject({ id: leafA.id, pluginId: "pluginA" });
    expect(result.children[1]).toMatchObject({ id: leafB.id, pluginId: "pluginA" });
  });

  it("splitPane always splits and opens a new instance, even if the plugin is open elsewhere", () => {
    const leafA = createLeaf("pluginA");
    const leafB = createLeaf(null);
    const tree = { type: "split" as const, id: "split1", direction: "row" as const, children: [leafA, leafB] as [typeof leafA, typeof leafB], sizes: [50, 50] as [number, number] };
    useAppStore.setState({ paneTree: tree, activePaneId: leafA.id });
    useAppStore.getState().splitPane(leafB.id, "right", "pluginA");
    const result = useAppStore.getState().paneTree;
    expect(result).not.toBe(tree);
    if (result.type !== "split") throw new Error("expected split");
    const innerB = result.children[1];
    if (innerB.type !== "split") throw new Error("expected nested split at leafB");
    // "right" puts the pre-existing pane first, the new instance second -
    // focus must land on the new leaf specifically, not the first match in
    // tree order (that would wrongly be leafA here).
    expect(innerB.children[0]).toMatchObject({ id: leafB.id, pluginId: null });
    expect(innerB.children[1]).toMatchObject({ pluginId: "pluginA" });
    expect(useAppStore.getState().activePaneId).toBe(innerB.children[1].id);
    expect(useAppStore.getState().activePaneId).not.toBe(leafA.id);
  });

  it("splitPane is a no-op when paneId isn't found, focusing paneId as a fallback", () => {
    const leafA = createLeaf("pluginA");
    useAppStore.setState({ paneTree: leafA, activePaneId: leafA.id });
    useAppStore.getState().splitPane("missing-id", "left", "pluginB");
    expect(useAppStore.getState().paneTree).toBe(leafA);
    expect(useAppStore.getState().activePaneId).toBe("missing-id");
  });
});

describe("closePane", () => {
  it("is a no-op when only one pane exists", () => {
    const leaf = createLeaf("pluginA");
    useAppStore.setState({ paneTree: leaf, activePaneId: leaf.id });
    useAppStore.getState().closePane(leaf.id);
    expect(useAppStore.getState().paneTree).toBe(leaf);
  });

  it("re-targets activePaneId to the surviving pane when the active pane is closed", () => {
    const leafA = createLeaf("pluginA");
    const leafB = createLeaf("pluginB");
    const tree = { type: "split" as const, id: "split1", direction: "row" as const, children: [leafA, leafB] as [typeof leafA, typeof leafB], sizes: [50, 50] as [number, number] };
    useAppStore.setState({ paneTree: tree, activePaneId: leafA.id });
    useAppStore.getState().closePane(leafA.id);
    expect(useAppStore.getState().activePaneId).toBe(leafB.id);
    expect(useAppStore.getState().paneTree).toBe(leafB);
  });
});

describe("deleteCustomPalette / hidePalette", () => {
  it("deleteCustomPalette falls back to premadePalettes[0] when deleting the active palette", () => {
    mockInvokeDefaults();
    const custom = { id: "mine", name: "Mine", colors: premadePalettes[0].colors };
    useAppStore.setState({ customPalettes: [custom], paletteId: "mine", hiddenPaletteIds: [] });
    useAppStore.getState().deleteCustomPalette("mine");
    expect(useAppStore.getState().paletteId).toBe(premadePalettes[0].id);
  });

  it("hidePalette falls back to premadePalettes[0] when hiding the active palette", () => {
    mockInvokeDefaults();
    const other = premadePalettes[1];
    useAppStore.setState({ customPalettes: [], paletteId: other.id, hiddenPaletteIds: [] });
    useAppStore.getState().hidePalette(other.id);
    expect(useAppStore.getState().paletteId).toBe(premadePalettes[0].id);
    expect(useAppStore.getState().hiddenPaletteIds).toContain(other.id);
  });
});

describe("saveCustomPalette", () => {
  it("un-hides a previously-hidden premade palette id when overridden", () => {
    mockInvokeDefaults();
    const overridden = { id: premadePalettes[1].id, name: premadePalettes[1].name, colors: premadePalettes[0].colors };
    useAppStore.setState({ customPalettes: [], hiddenPaletteIds: [premadePalettes[1].id] });
    useAppStore.getState().saveCustomPalette(overridden);
    expect(useAppStore.getState().hiddenPaletteIds).not.toContain(premadePalettes[1].id);
  });
});

describe("movePlugin", () => {
  it("filters unknown ids out of pluginOrder and appends new/unlisted ids", () => {
    mockInvokeDefaults();
    useAppStore.setState({
      plugins: { a: pluginEntry("a"), b: pluginEntry("b") },
      pluginOrder: ["stale", "a"],
    });
    useAppStore.getState().movePlugin("b", "Other", null);
    expect(useAppStore.getState().pluginOrder).toEqual(["a", "b"]);
  });

  it("falls back to append when beforeId isn't found, and reports categoryChanged/dir", () => {
    mockInvokeDefaults();
    useAppStore.setState({
      plugins: { a: { ...pluginEntry("a"), category: "Other" }, b: pluginEntry("b") },
      pluginOrder: ["a", "b"],
    });
    const result = useAppStore.getState().movePlugin("a", "Utilities", "not-a-real-id");
    expect(useAppStore.getState().pluginOrder).toEqual(["b", "a"]);
    expect(result).toEqual({ categoryChanged: true, dir: "a" });
  });
});
