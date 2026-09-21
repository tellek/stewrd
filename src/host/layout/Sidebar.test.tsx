/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { DEFAULT_CATEGORIES } from "../../shared/category";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));

function makeEntry(id: string, name: string): PluginSidebarEntry {
  return {
    manifest: { id, name, icon: "icon.png", entry: "index.js", description: "", apiVersion: "1", background: false },
    status: "idle",
    dir: id,
    category: "Other",
  };
}

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    categoryIconFiles: [],
    categories: DEFAULT_CATEGORIES,
    categoriesExpanded: {},
    sidebarCollapsed: false,
    plugins: {},
    pluginOrder: [],
    layouts: [],
    paneTree: { type: "leaf", id: "pane-1", pluginId: null },
    activePaneId: "pane-1",
    sidebarItemsByPlugin: {},
    sidebarSubItemsExpanded: {},
    pluginsWithSidebarItems: [],
  });
}

describe("Sidebar", () => {
  it("renders a category section for each plugin's resolved category", () => {
    resetStore();
    const entry = makeEntry("notepad", "Notepad");
    useAppStore.setState({ plugins: { notepad: entry } });
    render(<Sidebar />);
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("Notepad")).toBeTruthy();
  });

  it("renders the collapse-rail expand button instead of the footer when collapsed", () => {
    resetStore();
    useAppStore.setState({ sidebarCollapsed: true });
    render(<Sidebar />);
    expect(screen.getByTitle("Expand sidebar")).toBeTruthy();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("renders the footer with a Settings button when expanded", () => {
    resetStore();
    render(<Sidebar />);
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("does not render a Layouts section when there's only one pane and no saved layouts", () => {
    resetStore();
    render(<Sidebar />);
    expect(screen.queryByText("Layouts")).toBeNull();
  });
});
