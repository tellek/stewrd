/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarCategoryCollapsed } from "./SidebarCategoryCollapsed";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import type { CategoryDef } from "../../shared/category";

const category: CategoryDef = { id: "tools", name: "Tools", icon: "wrench" };

function makeEntry(id: string, name: string): PluginSidebarEntry {
  return {
    manifest: { id, name, icon: "icon.png", entry: "index.js", description: "", apiVersion: "1", background: false },
    status: "idle",
    dir: id,
    category: "tools",
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
  });
}

describe("SidebarCategoryCollapsed", () => {
  it("renders a button per entry, titled with the plugin's name", () => {
    resetStore();
    render(<SidebarCategoryCollapsed category={category} entries={[makeEntry("notepad", "Notepad")]} />);
    expect(screen.getByTitle("Notepad")).toBeTruthy();
  });

  it("toggles the category expanded state when the header button is clicked", async () => {
    resetStore();
    const toggleCategory = vi.spyOn(useAppStore.getState(), "toggleCategory");
    const user = userEvent.setup();
    render(<SidebarCategoryCollapsed category={category} entries={[makeEntry("notepad", "Notepad")]} />);

    await user.click(screen.getByTitle("Tools"));

    expect(toggleCategory).toHaveBeenCalledWith("tools");
  });

  it("hides entries when the category is collapsed", () => {
    resetStore();
    useAppStore.setState({ categoriesExpanded: { tools: false } });
    render(<SidebarCategoryCollapsed category={category} entries={[makeEntry("notepad", "Notepad")]} />);
    expect(screen.queryByTitle("Notepad")).toBeNull();
  });

  it("calls setPaneTool with the plugin id when a plugin button is clicked", async () => {
    resetStore();
    const setPaneTool = vi.spyOn(useAppStore.getState(), "setPaneTool");
    const user = userEvent.setup();
    render(<SidebarCategoryCollapsed category={category} entries={[makeEntry("notepad", "Notepad")]} />);

    await user.click(screen.getByTitle("Notepad"));

    expect(setPaneTool).toHaveBeenCalledWith("pane-1", "notepad");
  });
});
