/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Drawer } from "./Drawer";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

afterEach(() => {
  vi.useRealTimers();
});

async function flushRafs() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    resetStore();
    const { container } = render(<Drawer open={false} onClose={vi.fn()} title="Settings" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the title and children when open", async () => {
    resetStore();
    render(
      <Drawer open onClose={vi.fn()} title="Settings">
        <button>Save</button>
      </Drawer>,
    );
    await flushRafs();

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("calls onClose when the blanket is clicked", async () => {
    resetStore();
    const onClose = vi.fn();
    const { container } = render(<Drawer open onClose={onClose} title="Settings" />);
    await flushRafs();

    const outer = container.firstChild as HTMLElement;
    const blanket = outer.firstChild as HTMLElement;
    blanket.click();

    expect(onClose).toHaveBeenCalled();
  });

  it("stays mounted after open goes false until the close timer elapses", async () => {
    resetStore();
    vi.useFakeTimers();
    const { rerender } = render(<Drawer open onClose={vi.fn()} title="Settings" durationMs={220} />);

    rerender(<Drawer open={false} onClose={vi.fn()} title="Settings" durationMs={220} />);
    expect(screen.getByText("Settings")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("uses at least the blanket's 1s fade duration even when durationMs is shorter", async () => {
    resetStore();
    vi.useFakeTimers();
    const { rerender } = render(<Drawer open onClose={vi.fn()} title="Settings" durationMs={100} />);

    rerender(<Drawer open={false} onClose={vi.fn()} title="Settings" durationMs={100} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Settings")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("does not render a title element when title isn't provided", async () => {
    resetStore();
    const { container } = render(<Drawer open onClose={vi.fn()} />);
    await flushRafs();

    expect(container.querySelector("h3")).toBeNull();
  });
});
