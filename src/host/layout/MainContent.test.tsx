/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MainContent, detectEdgeAt, clampPanePercent } from "./MainContent";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import type { PluginRegistryEntry } from "../loader/usePluginRegistry";
import type { PaneNode } from "../state/paneTree";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../loader/pluginDiscovery", () => ({
  listPlugins: vi.fn().mockResolvedValue([]),
  installPluginFromArchive: vi.fn(),
  readPluginSettingsFile: vi.fn(),
  removePlugin: vi.fn(),
  setPluginDisabled: vi.fn(),
  writePluginSettingsFile: vi.fn(),
}));

function StubComponent() {
  return <div>Notepad Content</div>;
}

function makeEntry(id: string, name: string): PluginRegistryEntry {
  return {
    manifest: { id, name, icon: "icon.png", entry: "index.js", description: "", apiVersion: "1", background: false },
    Component: StubComponent,
    api: {} as PluginRegistryEntry["api"],
    generation: 0,
    loaded: true,
    dir: id,
    category: "tools",
  };
}

function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
    dropEffect: "move",
  };
}

// jsdom has no DragEvent constructor, so testing-library's fireEvent.dragOver
// falls back to a plain Event and silently drops clientX/clientY (they
// aren't Event constructor options). Build a MouseEvent instead (jsdom
// supports it) and attach dataTransfer manually, matching what a real
// DragEvent looks like from the component's perspective.
function fireDragEvent(
  el: HTMLElement,
  type: "dragover" | "drop",
  opts: { dataTransfer: ReturnType<typeof makeDataTransfer>; clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: opts.clientX, clientY: opts.clientY });
  Object.defineProperty(event, "dataTransfer", { value: opts.dataTransfer });
  fireEvent(el, event);
}

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    view: "plugin",
    activePaneId: "pane-1",
    paneTree: { type: "leaf", id: "pane-1", pluginId: null },
    draggingPluginId: null,
  });
}

describe("detectEdgeAt", () => {
  it("returns center for a point in the middle", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
    expect(detectEdgeAt(50, 50, rect)).toBe("center");
  });

  it("returns left/right/top/bottom for points within the 20% margin band", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
    expect(detectEdgeAt(5, 50, rect)).toBe("left");
    expect(detectEdgeAt(95, 50, rect)).toBe("right");
    expect(detectEdgeAt(50, 5, rect)).toBe("top");
    expect(detectEdgeAt(50, 95, rect)).toBe("bottom");
  });
});

describe("clampPanePercent", () => {
  it("clamps values below the minimum up to 15", () => {
    expect(clampPanePercent(2)).toBe(15);
  });

  it("clamps values above the maximum down to 85", () => {
    expect(clampPanePercent(99)).toBe(85);
  });

  it("passes through in-range values unchanged", () => {
    expect(clampPanePercent(50)).toBe(50);
  });
});

describe("MainContent", () => {
  it("renders the empty-pane placeholder when no plugin is assigned", () => {
    resetStore();
    render(<MainContent entries={[]} onReload={vi.fn()} />);
    expect(screen.getByText(/Drag a tool here/)).toBeTruthy();
  });

  it("renders the active plugin's Component when loaded", () => {
    resetStore();
    useAppStore.setState({ paneTree: { type: "leaf", id: "pane-1", pluginId: "notepad" } });
    render(<MainContent entries={[makeEntry("notepad", "Notepad")]} onReload={vi.fn()} />);
    expect(screen.getByText("Notepad Content")).toBeTruthy();
  });

  it("renders SettingsPage instead of the pane tree when view is settings", () => {
    resetStore();
    useAppStore.setState({ view: "settings" });
    render(<MainContent entries={[]} onReload={vi.fn()} />);
    expect(screen.queryByText(/Drag a tool here/)).toBeNull();
  });

  it("does not render the close button when there's only one pane", () => {
    resetStore();
    render(<MainContent entries={[]} onReload={vi.fn()} />);
    expect(screen.queryByTitle("Close pane")).toBeNull();
  });

  it("splits the pane when a plugin is dropped on a non-center edge zone", () => {
    resetStore();
    const dataTransfer = makeDataTransfer();
    dataTransfer.setData("text/plain", "notepad");
    const { container } = render(<MainContent entries={[makeEntry("notepad", "Notepad")]} onReload={vi.fn()} />);
    const dropTarget = container.querySelector("main > div") as HTMLElement;
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    } as DOMRect);

    fireDragEvent(dropTarget, "dragover", { dataTransfer, clientX: 5, clientY: 50 });
    fireDragEvent(dropTarget, "drop", { dataTransfer, clientX: 5, clientY: 50 });

    const tree = useAppStore.getState().paneTree as Extract<PaneNode, { type: "split" }>;
    expect(tree.type).toBe("split");
  });

  it("assigns a plugin to the pane when dropped in the center zone", () => {
    resetStore();
    const dataTransfer = makeDataTransfer();
    dataTransfer.setData("text/plain", "notepad");
    const { container } = render(<MainContent entries={[makeEntry("notepad", "Notepad")]} onReload={vi.fn()} />);
    const dropTarget = container.querySelector("main > div") as HTMLElement;
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    } as DOMRect);

    fireDragEvent(dropTarget, "dragover", { dataTransfer, clientX: 50, clientY: 50 });
    fireDragEvent(dropTarget, "drop", { dataTransfer, clientX: 50, clientY: 50 });

    const tree = useAppStore.getState().paneTree as Extract<PaneNode, { type: "leaf" }>;
    expect(tree.pluginId).toBe("notepad");
  });

  it("opens a second independent instance when a plugin already open elsewhere is dropped on another pane", () => {
    resetStore();
    useAppStore.setState({
      paneTree: {
        type: "split",
        id: "split-1",
        direction: "row",
        sizes: [50, 50],
        children: [
          { type: "leaf", id: "pane-1", pluginId: "notepad" },
          { type: "leaf", id: "pane-2", pluginId: null },
        ],
      },
    });
    const dataTransfer = makeDataTransfer();
    dataTransfer.setData("text/plain", "notepad");
    const { container } = render(<MainContent entries={[makeEntry("notepad", "Notepad")]} onReload={vi.fn()} />);
    const dropTarget = container.querySelectorAll("main > div > div > div")[1] as HTMLElement;
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    } as DOMRect);

    fireDragEvent(dropTarget, "dragover", { dataTransfer, clientX: 50, clientY: 50 });
    fireDragEvent(dropTarget, "drop", { dataTransfer, clientX: 50, clientY: 50 });

    const tree = useAppStore.getState().paneTree as Extract<PaneNode, { type: "split" }>;
    expect(tree.children[0]).toMatchObject({ id: "pane-1", pluginId: "notepad" });
    expect(tree.children[1]).toMatchObject({ id: "pane-2", pluginId: "notepad" });
    expect(useAppStore.getState().activePaneId).toBe("pane-2");
  });

  it("closes a pane via the close button when more than one pane exists", () => {
    resetStore();
    useAppStore.setState({
      paneTree: {
        type: "split",
        id: "split-1",
        direction: "row",
        sizes: [50, 50],
        children: [
          { type: "leaf", id: "pane-1", pluginId: null },
          { type: "leaf", id: "pane-2", pluginId: null },
        ],
      },
    });
    render(<MainContent entries={[]} onReload={vi.fn()} />);

    const closeButtons = screen.getAllByTitle("Close pane");
    fireEvent.click(closeButtons[0]);

    const tree = useAppStore.getState().paneTree;
    expect(tree.type).toBe("leaf");
  });

  it("resizes a split via pointer-event drag on the divider", () => {
    resetStore();
    useAppStore.setState({
      paneTree: {
        type: "split",
        id: "split-1",
        direction: "row",
        sizes: [50, 50],
        children: [
          { type: "leaf", id: "pane-1", pluginId: null },
          { type: "leaf", id: "pane-2", pluginId: null },
        ],
      },
    });
    const { container } = render(<MainContent entries={[]} onReload={vi.fn()} />);
    const outerSplit = container.querySelector("main > div") as HTMLElement;
    vi.spyOn(outerSplit, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
    } as DOMRect);
    const divider = outerSplit.children[1] as HTMLElement;

    fireEvent.pointerDown(divider, { clientX: 100, clientY: 50 });
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 150, clientY: 50 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 150, clientY: 50 }));

    const tree = useAppStore.getState().paneTree as Extract<PaneNode, { type: "split" }>;
    expect(tree.sizes[0]).toBe(75);
  });
});
