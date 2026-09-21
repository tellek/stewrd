/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarLayouts } from "./SidebarLayouts";
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

describe("SidebarLayouts", () => {
  it("renders the Layouts header and each saved layout's name", () => {
    resetStore();
    render(<SidebarLayouts />);
    expect(screen.getByText("Layouts")).toBeTruthy();
    expect(screen.getByText("Two Panes")).toBeTruthy();
  });

  it("calls applyLayout when a saved layout is clicked", async () => {
    resetStore();
    const applyLayout = vi.spyOn(useAppStore.getState(), "applyLayout");
    const user = userEvent.setup();
    render(<SidebarLayouts />);

    await user.click(screen.getByText("Two Panes"));

    expect(applyLayout).toHaveBeenCalledWith("l1");
  });

  it("calls deleteLayout when the delete (X) icon is clicked", async () => {
    resetStore();
    const deleteLayout = vi.spyOn(useAppStore.getState(), "deleteLayout");
    const user = userEvent.setup();
    render(<SidebarLayouts />);

    await user.click(screen.getByTitle("Delete layout"));

    expect(deleteLayout).toHaveBeenCalledWith("l1");
  });

  it("prompts for a name and saves the layout when Save is clicked", async () => {
    resetStore();
    vi.mocked(promptModal).mockResolvedValue("My Layout");
    const saveLayout = vi.spyOn(useAppStore.getState(), "saveLayout");
    const user = userEvent.setup();
    render(<SidebarLayouts />);

    await user.click(screen.getByText("Save"));

    expect(promptModal).toHaveBeenCalled();
    expect(saveLayout).toHaveBeenCalledWith("My Layout");
  });

  it("does not save when the prompt is cancelled", async () => {
    resetStore();
    vi.mocked(promptModal).mockResolvedValue(null);
    const saveLayout = vi.spyOn(useAppStore.getState(), "saveLayout");
    const user = userEvent.setup();
    render(<SidebarLayouts />);

    await user.click(screen.getByText("Save"));

    expect(saveLayout).not.toHaveBeenCalled();
  });
});
