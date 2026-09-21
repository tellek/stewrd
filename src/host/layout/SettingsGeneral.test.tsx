/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsGeneral } from "./SettingsGeneral";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { getName } from "@tauri-apps/api/app";

vi.mock("@tauri-apps/api/app", () => ({ getName: vi.fn() }));

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, taskbarBadgeThreshold: "off" });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("SettingsGeneral", () => {
  it("shows the app name once getName resolves", async () => {
    resetStore();
    vi.mocked(getName).mockResolvedValue("stewrd");
    render(<SettingsGeneral />);

    expect(await screen.findByText("stewrd")).toBeTruthy();
  });

  it("shows an error message when getName rejects", async () => {
    resetStore();
    vi.mocked(getName).mockRejectedValue(new Error("no window"));
    render(<SettingsGeneral />);

    expect(await screen.findByText(/Couldn't read app info: no window/)).toBeTruthy();
  });

  it("highlights the active taskbar badge threshold option", () => {
    resetStore();
    useAppStore.setState({ taskbarBadgeThreshold: "warning" });
    vi.mocked(getName).mockResolvedValue("stewrd");
    render(<SettingsGeneral />);

    const button = screen.getByText("Warning or worse");
    expect(button.style.borderColor).toBe(hexToRgb(defaultPalette.accent));
  });

  it("calls setTaskbarBadgeThreshold when an option is clicked", async () => {
    resetStore();
    vi.mocked(getName).mockResolvedValue("stewrd");
    const setTaskbarBadgeThreshold = vi.spyOn(useAppStore.getState(), "setTaskbarBadgeThreshold");
    const user = userEvent.setup();
    render(<SettingsGeneral />);

    await user.click(screen.getByText("Error or worse"));

    expect(setTaskbarBadgeThreshold).toHaveBeenCalledWith("error");
  });
});
