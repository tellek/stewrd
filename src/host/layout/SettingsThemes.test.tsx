/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsThemes } from "./SettingsThemes";
import { Modal } from "../../components/Modal/Modal";
import { useAppStore } from "../state/appStore";
import { defaultPalette, premadePalettes } from "../../shared/palette";

vi.mock("../api/ai", () => ({ runHeadlessAi: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ tempDir: vi.fn().mockResolvedValue("/tmp") }));

import { runHeadlessAi } from "../api/ai";

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    paletteId: premadePalettes[0].id,
    customPalettes: [],
    hiddenPaletteIds: [],
    modalQueue: [],
  });
  vi.mocked(runHeadlessAi).mockReset();
}

describe("SettingsThemes", () => {
  it("renders the premade palettes", () => {
    resetStore();
    render(<SettingsThemes />);
    expect(screen.getByText(premadePalettes[0].name)).toBeTruthy();
  });

  it("creates a new custom palette with Title Case buttons", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsThemes />);

    await user.click(screen.getByRole("button", { name: "Create New Palette" }));
    const nameInput = screen.getByPlaceholderText("Palette name");
    await user.type(nameInput, "My Theme");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useAppStore.getState().customPalettes.some((p) => p.name === "My Theme")).toBe(true);
  });

  it("shows a reserved-name error when creating a palette named 'dark'", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<SettingsThemes />);

    await user.click(screen.getByRole("button", { name: "Create New Palette" }));
    await user.type(screen.getByPlaceholderText("Palette name"), "dark");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/reserved name/)).toBeTruthy();
    expect(useAppStore.getState().customPalettes).toHaveLength(0);
  });

  it("deletes a custom palette after confirming the modal", async () => {
    resetStore();
    useAppStore.setState({
      customPalettes: [{ id: "mine", name: "Mine", colors: defaultPalette }],
    });
    const user = userEvent.setup();
    render(
      <>
        <SettingsThemes />
        <Modal />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Delete Mine" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(useAppStore.getState().customPalettes).toHaveLength(0);
    });
  });

  it("hides a premade palette after confirming the modal", async () => {
    resetStore();
    const user = userEvent.setup();
    const target = premadePalettes.find((p) => p.id !== "dark" && p.id !== "light")!;
    render(
      <>
        <SettingsThemes />
        <Modal />
      </>,
    );

    await user.click(screen.getByRole("button", { name: `Delete ${target.name}` }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(useAppStore.getState().hiddenPaletteIds).toContain(target.id);
    });
  });

  it("shows an error modal and re-enables the form when generation fails", async () => {
    resetStore();
    const rejected = Promise.reject(new Error("boom"));
    rejected.catch(() => {});
    vi.mocked(runHeadlessAi).mockReturnValue({
      done: rejected,
      kill: vi.fn(),
    } as any);
    const user = userEvent.setup();
    render(
      <>
        <SettingsThemes />
        <Modal />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Generate New Palette" }));
    await user.type(screen.getByPlaceholderText("Movie, show, or game title"), "Some Movie");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    const okButton = await screen.findByRole("button", { name: "OK" });
    expect(screen.getByText("Generate failed")).toBeTruthy();
    await user.click(okButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate" })).not.toHaveProperty("disabled", true);
    });
  });

  it("cancels an in-flight generation and does not save a palette", async () => {
    resetStore();
    const user = userEvent.setup();
    let rejectDone: (err: unknown) => void = () => {};
    const pending = new Promise((_resolve, reject) => {
      rejectDone = reject;
    });
    pending.catch(() => {});
    vi.mocked(runHeadlessAi).mockReturnValue({
      done: pending,
      kill: vi.fn(),
    } as any);
    render(<SettingsThemes />);

    await user.click(screen.getByRole("button", { name: "Generate New Palette" }));
    await user.type(screen.getByPlaceholderText("Movie, show, or game title"), "Some Movie");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await screen.findByRole("button", { name: "Cancel" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await act(async () => {
      rejectDone(new Error("cancelled"));
      await Promise.resolve();
    });

    expect(useAppStore.getState().customPalettes).toHaveLength(0);
  });
});
