/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarCategory } from "./SidebarCategory";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import type { CategoryDef } from "../../shared/category";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));

const category: CategoryDef = { id: "tools", name: "Tools", icon: "wrench" };

function makeEntry(id: string, name: string, cat = "tools"): PluginSidebarEntry {
  return {
    manifest: { id, name, icon: "icon.png", entry: "index.js", description: "", apiVersion: "1", background: false },
    status: "idle",
    dir: id,
    category: cat,
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

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    categoryIconFiles: [],
    categoriesExpanded: {},
    activePaneId: "pane-1",
    paneTree: { type: "leaf", id: "pane-1", pluginId: null },
    sidebarItemsByPlugin: {},
    sidebarSubItemsExpanded: {},
    pluginsWithSidebarItems: [],
    plugins: {},
    pluginOrder: [],
  });
}

describe("SidebarCategory", () => {
  it("renders the category name and each entry's plugin name", () => {
    resetStore();
    const entries = [makeEntry("notepad", "Notepad")];
    useAppStore.setState({ plugins: { notepad: entries[0] } });
    render(<SidebarCategory category={category} entries={entries} />);
    expect(screen.getByText("Tools")).toBeTruthy();
    expect(screen.getByText("Notepad")).toBeTruthy();
  });

  it("toggles expansion when the header is clicked, hiding entries", async () => {
    resetStore();
    const entries = [makeEntry("notepad", "Notepad")];
    useAppStore.setState({ plugins: { notepad: entries[0] } });
    const user = userEvent.setup();
    render(<SidebarCategory category={category} entries={entries} />);

    await user.click(screen.getByText("Tools"));

    expect(screen.queryByText("Notepad")).toBeNull();
  });

  it("moves a dragged plugin within the same category via drop on another entry", () => {
    resetStore();
    const entries = [makeEntry("notepad", "Notepad"), makeEntry("git", "Git Tracker")];
    useAppStore.setState({
      plugins: { notepad: entries[0], git: entries[1] },
      pluginOrder: ["notepad", "git"],
    });
    const dataTransfer = makeDataTransfer();
    render(<SidebarCategory category={category} entries={entries} />);

    const notepadItem = screen.getByText("Notepad").closest("button") as HTMLElement;
    const gitItem = screen.getByText("Git Tracker").closest("button") as HTMLElement;

    fireEvent.dragStart(gitItem, { dataTransfer });
    fireEvent.dragOver(notepadItem, { dataTransfer });
    fireEvent.drop(notepadItem, { dataTransfer });

    expect(useAppStore.getState().pluginOrder).toEqual(["git", "notepad"]);
  });

  it("moves a dragged plugin into this category when dropped on the end drop-zone, updating its category", () => {
    resetStore();
    const draggedEntry = makeEntry("notepad", "Notepad", "other-category");
    const entries: PluginSidebarEntry[] = [];
    useAppStore.setState({ plugins: { notepad: draggedEntry }, pluginOrder: ["notepad"] });
    const dataTransfer = makeDataTransfer();
    dataTransfer.setData("text/plain", "notepad");
    const { container } = render(<SidebarCategory category={category} entries={entries} />);

    const dropZone = container.querySelector('div[style*="min-height"]') as HTMLElement;
    fireEvent.dragOver(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    expect(useAppStore.getState().plugins.notepad.category).toBe("tools");
  });
});
