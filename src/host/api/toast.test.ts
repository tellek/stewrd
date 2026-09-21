import { describe, expect, it, vi } from "vitest";
import { createToastApi, dismissToastNow } from "./toast";
import { useAppStore } from "../state/appStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("createToastApi().show", () => {
  it("pushes a toast to the store immediately", () => {
    useAppStore.setState({ toasts: [], fadingToastIds: [] });
    createToastApi().show({ message: "hi" });
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].message).toBe("hi");
  });

  it("fades then dismisses the toast after durationMs + 1000ms (FADE_MS)", () => {
    vi.useFakeTimers();
    useAppStore.setState({ toasts: [], fadingToastIds: [] });
    createToastApi().show({ message: "hi", durationMs: 500 });
    const id = useAppStore.getState().toasts[0].id;

    vi.advanceTimersByTime(500);
    expect(useAppStore.getState().fadingToastIds).toContain(id);
    expect(useAppStore.getState().toasts.some((t) => t.id === id)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(useAppStore.getState().toasts.some((t) => t.id === id)).toBe(false);

    vi.useRealTimers();
  });
});

describe("dismissToastNow", () => {
  it("fades immediately then removes the toast after 1000ms", () => {
    vi.useFakeTimers();
    useAppStore.setState({ toasts: [{ id: 42, message: "hi", kind: "idle", durationMs: 3000 }], fadingToastIds: [] });

    dismissToastNow(42);
    expect(useAppStore.getState().fadingToastIds).toContain(42);
    expect(useAppStore.getState().toasts.some((t) => t.id === 42)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(useAppStore.getState().toasts.some((t) => t.id === 42)).toBe(false);

    vi.useRealTimers();
  });
});
