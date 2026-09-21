/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarLayoutsCollapsed } from "./SidebarLayoutsCollapsed";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { promptModal } from "../api/modals";

vi.mock("../api/modals", () => ({ promptModal: vi.fn() }));

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    categoryIconFiles: [],
    layouts: [{ id: "l1", name: "Two Panes", tree: { type: "leaf", id: "a", pluginId: null } }],
  });
}

describe("SidebarLayoutsCollapsed", () => {
  it("renders one button per layout (titled with its name) plus a Save Layout button", () => {
    resetStore();
    render(<SidebarLayoutsCollapsed />);
    expect(screen.getByTitle("Two Panes")).toBeTruthy();
    expect(screen.getByTitle("Save Layout")).toBeTruthy();
  });

  it("calls applyLayout when a layout button is clicked", async () => {
    resetStore();
    const applyLayout = vi.spyOn(useAppStore.getState(), "applyLayout");
    const user = userEvent.setup();
    render(<SidebarLayoutsCollapsed />);

    await user.click(screen.getByTitle("Two Panes"));

    expect(applyLayout).toHaveBeenCalledWith("l1");
  });

  it("prompts for a name and saves the layout when the Save Layout button is clicked", async () => {
    resetStore();
    vi.mocked(promptModal).mockResolvedValue("My Layout");
    const saveLayout = vi.spyOn(useAppStore.getState(), "saveLayout");
    const user = userEvent.setup();
    render(<SidebarLayoutsCollapsed />);

    await user.click(screen.getByTitle("Save Layout"));

    expect(saveLayout).toHaveBeenCalledWith("My Layout");
  });
});
