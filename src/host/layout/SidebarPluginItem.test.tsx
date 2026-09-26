/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

function makeEntry(id: string, name: string): PluginSidebarEntry {
  return {
    manifest: { id, name, icon: "icon.png", entry: "index.js", description: "", apiVersion: "1", background: false },
    status: "idle",
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

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    activePaneId: "pane-1",
    paneTree: { type: "leaf", id: "pane-1", pluginId: null },
    sidebarItemsByPlugin: {},
    sidebarSubItemsExpanded: {},
    pluginsWithSidebarItems: [],
  });
}

describe("SidebarPluginItem", () => {
  it("renders the plugin's name", () => {
    resetStore();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={vi.fn()} />,
    );
    expect(screen.getByText("Notepad")).toBeTruthy();
  });

  it("calls focusOrOpenPlugin when clicked while not active", async () => {
    resetStore();
    const focusOrOpenPlugin = vi.spyOn(useAppStore.getState(), "focusOrOpenPlugin");
    const user = userEvent.setup();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={vi.fn()} />,
    );

    await user.click(screen.getByText("Notepad"));

    expect(focusOrOpenPlugin).toHaveBeenCalledWith("pane-1", "notepad");
  });

  it("toggles sub-items expansion when clicked while already active", async () => {
    resetStore();
    useAppStore.setState({ paneTree: { type: "leaf", id: "pane-1", pluginId: "notepad" } });
    const toggle = vi.spyOn(useAppStore.getState(), "toggleSidebarSubItemsExpanded");
    const user = userEvent.setup();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={vi.fn()} />,
    );

    await user.click(screen.getByText("Notepad"));

    expect(toggle).toHaveBeenCalledWith("notepad");
  });

  it("calls focusOrOpenPlugin (not toggle) when clicked while in settings view, even though it occupies the active pane", async () => {
    resetStore();
    useAppStore.setState({ paneTree: { type: "leaf", id: "pane-1", pluginId: "notepad" }, view: "settings" });
    const focusOrOpenPlugin = vi.spyOn(useAppStore.getState(), "focusOrOpenPlugin");
    const toggle = vi.spyOn(useAppStore.getState(), "toggleSidebarSubItemsExpanded");
    const user = userEvent.setup();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={vi.fn()} />,
    );

    await user.click(screen.getByText("Notepad"));

    expect(focusOrOpenPlugin).toHaveBeenCalledWith("pane-1", "notepad");
    expect(toggle).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("plugin");
  });

  it("highlights the row when the active pane holds this plugin even if another pane also does", () => {
    resetStore();
    useAppStore.setState({
      paneTree: {
        type: "split",
        id: "split-1",
        direction: "row",
        sizes: [50, 50],
        children: [
          { type: "leaf", id: "pane-other", pluginId: "notepad" },
          { type: "leaf", id: "pane-1", pluginId: "notepad" },
        ],
      },
      activePaneId: "pane-1",
    });
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={vi.fn()} />,
    );

    const button = screen.getByText("Notepad").closest("button") as HTMLElement;
    expect(button.style.background).not.toBe("transparent");
  });

  it("sets dataTransfer to the plugin id and updates draggingPluginId on drag start, and clears on drag end", () => {
    resetStore();
    const onDragEndItem = vi.fn();
    const dataTransfer = makeDataTransfer();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={vi.fn()} onDropItem={vi.fn()} onDragEndItem={onDragEndItem} />,
    );
    const item = screen.getByText("Notepad").closest("button") as HTMLElement;

    fireEvent.dragStart(item, { dataTransfer });
    expect(dataTransfer.getData("text/plain")).toBe("notepad");
    expect(useAppStore.getState().draggingPluginId).toBe("notepad");

    fireEvent.dragEnd(item);
    expect(useAppStore.getState().draggingPluginId).toBeNull();
    expect(onDragEndItem).toHaveBeenCalled();
  });

  it("passes the dragged id from dataTransfer through to onDropItem on drop", () => {
    resetStore();
    const onDropItem = vi.fn();
    const onDragOverItem = vi.fn();
    const dataTransfer = makeDataTransfer();
    render(
      <SidebarPluginItem entry={makeEntry("notepad", "Notepad")} onDragOverItem={onDragOverItem} onDropItem={onDropItem} onDragEndItem={vi.fn()} />,
    );
    const item = screen.getByText("Notepad").closest("button") as HTMLElement;

    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragOver(item, { dataTransfer });
    expect(onDragOverItem).toHaveBeenCalled();
    fireEvent.drop(item, { dataTransfer });

    expect(onDropItem).toHaveBeenCalledWith("notepad");
  });
});
