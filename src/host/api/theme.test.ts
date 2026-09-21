import { describe, expect, it, vi } from "vitest";
import { createThemeApi } from "./theme";
import { useAppStore, resolvePalette } from "../state/appStore";
import { premadePalettes } from "../../shared/palette";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("createThemeApi().subscribe", () => {
  it("fires the callback when the palette reference changes", () => {
    useAppStore.setState({ palette: resolvePalette(premadePalettes[0].id, []) });
    const fn = vi.fn();
    const unsubscribe = createThemeApi().subscribe(fn);

    const next = resolvePalette(premadePalettes[1].id, []);
    useAppStore.setState({ palette: next });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(next);
    unsubscribe();
  });

  it("does not fire when an unrelated field changes but the palette reference stays the same", () => {
    useAppStore.setState({ palette: resolvePalette(premadePalettes[0].id, []) });
    const fn = vi.fn();
    const unsubscribe = createThemeApi().subscribe(fn);

    useAppStore.setState({ statusLog: [] });

    expect(fn).not.toHaveBeenCalled();
    unsubscribe();
  });
});
