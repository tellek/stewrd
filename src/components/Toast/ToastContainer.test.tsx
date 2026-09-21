/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ToastContainer } from "./ToastContainer";
import { useAppStore } from "../../host/state/appStore";
import { createToastApi } from "../../host/api/toast";

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({ toasts: [], fadingToastIds: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a toast, fades it after durationMs, and removes it 1000ms later", () => {
    const api = createToastApi();
    api.show({ message: "Saved successfully.", durationMs: 2000 });
    render(<ToastContainer />);

    expect(screen.getByText("Saved successfully.")).toBeTruthy();
    expect(useAppStore.getState().fadingToastIds).toEqual([]);

    vi.advanceTimersByTime(2000);
    expect(useAppStore.getState().fadingToastIds).toEqual([1]);
    expect(screen.getByText("Saved successfully.")).toBeTruthy();

    vi.advanceTimersByTime(999);
    expect(useAppStore.getState().toasts.length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().toasts.length).toBe(0);
  });
});
