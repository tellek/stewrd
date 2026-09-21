/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePopover } from "./usePopover";

describe("usePopover", () => {
  it("closes when a pointerdown happens outside the ref'd element", () => {
    const { result } = renderHook(() => usePopover());
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => {
      result.current.ref.current = el;
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(result.current.open).toBe(false);

    document.body.removeChild(el);
  });

  it("does not close on a pointerdown inside the ref'd element", () => {
    const { result } = renderHook(() => usePopover());
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => {
      result.current.ref.current = el;
      result.current.setOpen(true);
    });

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(result.current.open).toBe(true);

    document.body.removeChild(el);
  });

  it("closes on escape key", () => {
    const { result } = renderHook(() => usePopover());
    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(result.current.open).toBe(false);
  });

  it("removes its document listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { result, unmount } = renderHook(() => usePopover());
    act(() => {
      result.current.setOpen(true);
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });
});
