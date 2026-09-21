/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPlugins } from "./SettingsPlugins";
import { Modal } from "../../components/Modal/Modal";
import { ToastContainer } from "../../components/Toast/ToastContainer";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import type { PluginDiscoveryEntry } from "../loader/pluginDiscovery";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../loader/pluginDiscovery", () => ({
  listPlugins: vi.fn(),
  installPluginFromArchive: vi.fn(),
  readPluginSettingsFile: vi.fn(),
  removePlugin: vi.fn(),
  setPluginDisabled: vi.fn(),
  writePluginSettingsFile: vi.fn(),
}));

import {
  listPlugins,
  installPluginFromArchive,
  readPluginSettingsFile,
  removePlugin,
  setPluginDisabled,
  writePluginSettingsFile,
} from "../loader/pluginDiscovery";

function okEntry(overrides: Partial<Extract<PluginDiscoveryEntry, { status: "ok" }>> = {}): PluginDiscoveryEntry {
  return {
    status: "ok",
    dir: "notepad",
    manifest: { id: "notepad", name: "Notepad", icon: "icon.png", entry: "index.js", description: "A notes app", apiVersion: "1", background: false },
    source: "index.js",
    disabled: false,
    category: "tools",
    version: "1.0.0",
    ...overrides,
  };
}

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, modalQueue: [], toasts: [] });
  vi.mocked(listPlugins).mockReset().mockResolvedValue([]);
  vi.mocked(installPluginFromArchive).mockReset();
  vi.mocked(readPluginSettingsFile).mockReset();
  vi.mocked(removePlugin).mockReset();
  vi.mocked(setPluginDisabled).mockReset().mockResolvedValue(undefined);
  vi.mocked(writePluginSettingsFile).mockReset();
}

describe("SettingsPlugins", () => {
  it("renders discovered plugins with Enabled status", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    render(<SettingsPlugins />);

    expect(await screen.findByText("Notepad", { exact: false })).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
  });

  it("renders an error entry's message", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([{ status: "error", dir: "broken", message: "bad manifest" }]);
    render(<SettingsPlugins />);

    expect(await screen.findByText("bad manifest")).toBeTruthy();
  });

  it("calls setPluginDisabled when Deactivate is clicked", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    const user = userEvent.setup();
    render(<SettingsPlugins />);

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(setPluginDisabled).toHaveBeenCalledWith("notepad", "notepad", true);
  });

  it("removes a plugin after confirming the modal and shows a success toast", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(removePlugin).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <>
        <SettingsPlugins />
        <Modal />
        <ToastContainer />
      </>,
    );

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Remove" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(removePlugin).toHaveBeenCalledWith("notepad"));
    expect(await screen.findByText('Removed "Notepad"')).toBeTruthy();
  });

  it("shows an error modal when removal fails", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(removePlugin).mockRejectedValue(new Error("disk error"));
    const user = userEvent.setup();
    render(
      <>
        <SettingsPlugins />
        <Modal />
      </>,
    );

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Remove" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByText("Remove failed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "OK" }));
  });

  it("loads settings.json into the ConfigurePanel when Configure is clicked", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(readPluginSettingsFile).mockResolvedValue('{"category":"tools"}');
    const user = userEvent.setup();
    render(<SettingsPlugins />);

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Configure" }));

    const textarea = await screen.findByDisplayValue('{"category":"tools"}');
    expect(textarea).toBeTruthy();
  });

  it("shows a load error when readPluginSettingsFile rejects", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(readPluginSettingsFile).mockRejectedValue(new Error("not found"));
    const user = userEvent.setup();
    render(<SettingsPlugins />);

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Configure" }));

    expect(await screen.findByText(/Failed to read settings.json/)).toBeTruthy();
  });

  it("blocks saving invalid JSON with a client-side error", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(readPluginSettingsFile).mockResolvedValue("{}");
    const user = userEvent.setup();
    render(<SettingsPlugins />);

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Configure" }));
    const textarea = await screen.findByDisplayValue("{}");
    await user.clear(textarea);
    await user.type(textarea, "not json");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Invalid JSON, not saved/)).toBeTruthy();
    expect(writePluginSettingsFile).not.toHaveBeenCalled();
  });

  it("shows a save error when writePluginSettingsFile rejects", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(readPluginSettingsFile).mockResolvedValue("{}");
    vi.mocked(writePluginSettingsFile).mockRejectedValue(new Error("write failed"));
    const user = userEvent.setup();
    render(<SettingsPlugins />);

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Configure" }));
    await screen.findByDisplayValue("{}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Error: write failed")).toBeTruthy();
  });

  it("saves settings.json and shows a success toast", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([okEntry()]);
    vi.mocked(readPluginSettingsFile).mockResolvedValue("{}");
    vi.mocked(writePluginSettingsFile).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <>
        <SettingsPlugins />
        <ToastContainer />
      </>,
    );

    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Configure" }));
    await screen.findByDisplayValue("{}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writePluginSettingsFile).toHaveBeenCalledWith("notepad", "{}"));
    expect(await screen.findByText("settings.json saved")).toBeTruthy();
  });

  it("installs a plugin from a picked file and shows a success toast", async () => {
    resetStore();
    vi.mocked(listPlugins).mockResolvedValue([]);
    vi.mocked(installPluginFromArchive).mockResolvedValue("notepad-2");
    render(
      <>
        <SettingsPlugins />
        <ToastContainer />
      </>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["zipcontent"], "plugin.zip", { type: "application/zip" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => expect(installPluginFromArchive).toHaveBeenCalled());
    expect(await screen.findByText('Installed plugin into "notepad-2"')).toBeTruthy();
  });
});
