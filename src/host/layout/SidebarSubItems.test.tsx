/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarSubItems } from "./SidebarSubItems";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    sidebarItemsByPlugin: {},
    sidebarSelectedByPlugin: {},
    sidebarSubItemsExpanded: {},
    activePaneId: "pane-1",
  });
}

describe("SidebarSubItems", () => {
  it("renders nothing when the plugin has no sidebar items", () => {
    resetStore();
    const { container } = render(<SidebarSubItems pluginId="notepad" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when collapsed even with items registered", () => {
    resetStore();
    const onClick = vi.fn();
    useAppStore.setState({
      sidebarItemsByPlugin: { notepad: [{ id: "a", label: "Item A", onClick }] },
      sidebarSubItemsExpanded: { notepad: false },
    });
    const { container } = render(<SidebarSubItems pluginId="notepad" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders each item's label when expanded", () => {
    resetStore();
    const onClick = vi.fn();
    useAppStore.setState({
      sidebarItemsByPlugin: { notepad: [{ id: "a", label: "Item A", onClick }] },
    });
    render(<SidebarSubItems pluginId="notepad" />);
    expect(screen.getByText("Item A")).toBeTruthy();
  });

  it("calls the item's onClick, sets it active, and selects it when clicked", async () => {
    resetStore();
    const onClick = vi.fn();
    useAppStore.setState({
      sidebarItemsByPlugin: { notepad: [{ id: "a", label: "Item A", onClick }] },
    });
    const focusOrOpenPlugin = vi.spyOn(useAppStore.getState(), "focusOrOpenPlugin");
    const user = userEvent.setup();
    render(<SidebarSubItems pluginId="notepad" />);

    await user.click(screen.getByText("Item A"));

    expect(onClick).toHaveBeenCalled();
    expect(focusOrOpenPlugin).toHaveBeenCalledWith("pane-1", "notepad");
    expect(useAppStore.getState().sidebarSelectedByPlugin.notepad).toBe("a");
  });
});
