/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarFooter } from "./SidebarFooter";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    categoryIconFiles: [],
    sidebarCollapsed: false,
    view: "plugin",
  });
}

describe("SidebarFooter", () => {
  it("renders a Settings button", () => {
    resetStore();
    render(<SidebarFooter />);
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("calls openSettings when the Settings button is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SidebarFooter />);

    await user.click(screen.getByText("Settings"));

    expect(useAppStore.getState().view).toBe("settings");
  });

  it("calls toggleSidebarCollapsed when the collapse button is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SidebarFooter />);

    await user.click(screen.getByTitle("Collapse sidebar"));

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
  });

  it("labels the collapse button 'Expand sidebar' when already collapsed", () => {
    resetStore();
    useAppStore.setState({ sidebarCollapsed: true });
    render(<SidebarFooter />);

    expect(screen.getByTitle("Collapse sidebar")).toBeTruthy();
  });
});
