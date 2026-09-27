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
    hasAnthropicKey: vi.fn().mockResolvedValue(false),
    setAnthropicKey: vi.fn().mockResolvedValue(undefined),
    clearAnthropicKey: vi.fn().mockResolvedValue(undefined),
  }),
}));

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, aiProvider: "claude-subscription" });
}

describe("SettingsAi", () => {
  it("highlights the active provider option", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "anthropic-api" });
    vi.mocked(invoke).mockResolvedValue(false);
    render(<SettingsAi />);

    const button = screen.getByRole("button", { name: "Anthropic API Key" });
    expect(button.style.borderColor).toBeTruthy();
  });

  it("calls setAiProvider when a provider option is clicked", async () => {
    resetStore();
    vi.mocked(invoke).mockResolvedValue(false);
    const setAiProvider = vi.spyOn(useAppStore.getState(), "setAiProvider");
    const user = userEvent.setup();
    render(<SettingsAi />);

    await user.click(screen.getByRole("button", { name: "Anthropic API Key" }));

    expect(setAiProvider).toHaveBeenCalledWith("anthropic-api");
  });

  it("shows not-detected CLI status under the claude-subscription provider", async () => {
    resetStore();
    vi.mocked(invoke).mockResolvedValue(false);
    render(<SettingsAi />);

    expect(await screen.findByText(/Not detected on PATH/)).toBeTruthy();
  });

  it("shows the key input under the anthropic-api provider", () => {
    resetStore();
    useAppStore.setState({ aiProvider: "anthropic-api" });
    vi.mocked(invoke).mockResolvedValue(false);
    render(<SettingsAi />);

    expect(screen.getByPlaceholderText("sk-ant-...")).toBeTruthy();
  });
});
