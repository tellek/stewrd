/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { InlineDialog } from "./InlineDialog";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("InlineDialog", () => {
  it("renders nothing when closed", () => {
    resetStore();
    const { container } = render(<InlineDialog open={false} onClose={vi.fn()} title="Confirm" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the title, message, and children when open", () => {
    resetStore();
    render(
      <InlineDialog open onClose={vi.fn()} title="Delete Item" message="Are you sure?">
        <button>Yes</button>
      </InlineDialog>,
    );
    expect(screen.getByText("Delete Item")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
  });

  it("calls onClose when the blanket behind it is clicked", async () => {
    resetStore();
    const onClose = vi.fn();
    const { container } = render(<InlineDialog open onClose={onClose} title="Delete Item" />);

    const blanket = container.firstChild as HTMLElement;
    blanket.click();

    expect(onClose).toHaveBeenCalled();
  });

  it("stays mounted after open goes false until the fade timer elapses", () => {
    resetStore();
    vi.useFakeTimers();
    const { rerender } = render(<InlineDialog open onClose={vi.fn()} title="Delete Item" />);

    rerender(<InlineDialog open={false} onClose={vi.fn()} title="Delete Item" />);
    expect(screen.getByText("Delete Item")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("Delete Item")).toBeNull();
  });
});
