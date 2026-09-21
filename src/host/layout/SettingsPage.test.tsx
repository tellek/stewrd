/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { getName, getVersion } from "@tauri-apps/api/app";
import { listReleases, pendingUpdateVersion } from "../api/updates";
import { listPlugins } from "../loader/pluginDiscovery";

vi.mock("@tauri-apps/api/app", () => ({ getName: vi.fn(), getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ tempDir: vi.fn().mockResolvedValue("/tmp") }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../api/updates", () => ({ listReleases: vi.fn(), pendingUpdateVersion: vi.fn() }));
vi.mock("../api/ai", () => ({ runHeadlessAi: vi.fn() }));
vi.mock("../loader/pluginDiscovery", () => ({
  listPlugins: vi.fn().mockResolvedValue([]),
  installPluginFromArchive: vi.fn(),
  readPluginSettingsFile: vi.fn(),
  removePlugin: vi.fn(),
  setPluginDisabled: vi.fn(),
  writePluginSettingsFile: vi.fn(),
}));

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    taskbarBadgeThreshold: "off",
    paletteId: "dark",
    customPalettes: [],
    hiddenPaletteIds: [],
    categories: [],
    modalQueue: [],
  });
  vi.mocked(getName).mockResolvedValue("stewrd");
  vi.mocked(getVersion).mockResolvedValue("1.0.0");
  vi.mocked(listReleases).mockResolvedValue([]);
  vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
  vi.mocked(listPlugins).mockResolvedValue([]);
}

describe("SettingsPage", () => {
  it("renders the General tab by default", async () => {
    resetStore();
    render(<SettingsPage />);
    expect(await screen.findByText("stewrd")).toBeTruthy();
  });

  it("switches to the Themes tab when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("stewrd");

    await user.click(screen.getByRole("button", { name: "Themes" }));

    expect(screen.getByRole("button", { name: "Create New Palette" })).toBeTruthy();
  });

  it("switches to the Plugins tab when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("stewrd");

    await user.click(screen.getByRole("button", { name: "Plugins" }));

    expect(screen.getByRole("button", { name: "Choose File" })).toBeTruthy();
  });

  it("switches to the Version tab when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("stewrd");

    await user.click(screen.getByRole("button", { name: "Version" }));

    expect(await screen.findByText("Installed version: 1.0.0")).toBeTruthy();
  });

  it("switches to the Categories tab when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("stewrd");

    await user.click(screen.getByRole("button", { name: "Categories" }));

    expect(screen.queryByText("stewrd")).toBeNull();
  });
});
