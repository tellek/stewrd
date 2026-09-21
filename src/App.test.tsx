/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import App from "./App";
import { useAppStore } from "./host/state/appStore";
import { defaultPalette } from "./shared/palette";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({ setOverlayIcon: vi.fn().mockRejectedValue(new Error("unsupported")) }),
}));
vi.mock("./host/loader/pluginDiscovery", () => ({
  listPlugins: vi.fn().mockResolvedValue([]),
  isSafeMode: vi.fn().mockResolvedValue(false),
  reconcileBootMarks: vi.fn().mockResolvedValue([]),
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
    hostSettingsLoaded: false,
    paneTree: { type: "leaf", id: "pane-1", pluginId: null },
    activePaneId: "pane-1",
    plugins: {},
    pluginOrder: [],
    statusLog: [],
    view: "plugin",
    modalQueue: [],
    toasts: [],
  });
}

describe("App", () => {
  it("mounts without throwing and renders its structural pieces once host settings load", async () => {
    resetStore();
    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().hostSettingsLoaded).toBe(true);
    });
    expect(await screen.findByText(/Drag a tool here/)).toBeTruthy();
  });
});
