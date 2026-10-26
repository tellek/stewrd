/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsAi } from "./SettingsAi";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../api/secrets", () => ({
  createSecretsApi: () => ({
    hasKey: vi.fn().mockResolvedValue(false),
    setKey: vi.fn().mockResolvedValue(undefined),
    setCustom: vi.fn().mockResolvedValue(undefined),
    clearKey: vi.fn().mockResolvedValue(undefined),
    getCustomBaseUrl: vi.fn().mockResolvedValue(null),
  }),
}));

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, aiProvider: "claude-cli", aiModels: {} });
  vi.mocked(invoke).mockResolvedValue(null);
}

describe("SettingsAi", () => {
  it("explains how secrets are stored for every provider", () => {
    resetStore();
    render(<SettingsAi />);

    expect(screen.getByText(/How secrets are stored/)).toBeTruthy();
    expect(screen.getByText(/operating system's keychain/)).toBeTruthy();
  });

  it("highlights the active mode button", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "claude-api" });
    render(<SettingsAi />);

    expect(screen.getByRole("button", { name: "API Key" }).style.borderColor).toBeTruthy();
  });

  it("switches mode via setAiProvider", async () => {
    resetStore();
    const setAiProvider = vi.spyOn(useAppStore.getState(), "setAiProvider");
    const user = userEvent.setup();
    render(<SettingsAi />);

    await user.click(screen.getByRole("button", { name: "API Key" }));

    expect(setAiProvider).toHaveBeenCalledWith("claude-api");
  });

  it("keeps the mode when switching providers, and falls back when the new provider lacks it", async () => {
    resetStore();
    const setAiProvider = vi.spyOn(useAppStore.getState(), "setAiProvider");
    const user = userEvent.setup();
    render(<SettingsAi />);

    await user.selectOptions(screen.getByLabelText("Provider"), "openai");
    expect(setAiProvider).toHaveBeenLastCalledWith("openai-cli");

    useAppStore.setState({ aiProvider: "claude-api" });
    cleanup();
    render(<SettingsAi />);
    await user.selectOptions(screen.getByLabelText("Provider"), "copilot");
    expect(setAiProvider).toHaveBeenLastCalledWith("copilot-cli");
  });

  it("offers only the modes a provider supports", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "copilot-cli" });
    render(<SettingsAi />);

    expect(screen.queryByRole("button", { name: "API Key" })).toBeNull();
    expect(screen.getByRole("button", { name: "CLI" })).toBeTruthy();
  });

  it("shows not-detected CLI status under the claude-cli provider", async () => {
    resetStore();
    render(<SettingsAi />);

    expect(await screen.findByText(/Not detected on PATH/)).toBeTruthy();
  });

  it("shows the key input under the claude-api provider", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "claude-api" });
    render(<SettingsAi />);

    expect(screen.getByPlaceholderText("sk-ant-...")).toBeTruthy();
  });

  it("lets the custom provider save an endpoint with an empty key", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "custom-api" });
    render(<SettingsAi />);

    expect(screen.getByPlaceholderText("https://api.deepseek.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Endpoint" })).toBeTruthy();
  });
});
