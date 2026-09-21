/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { Blanket } from "./Blanket";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";
import { scrimColor } from "../shared/styles";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Blanket", () => {
  it("renders with the palette-derived scrim color and starts at opacity 0", () => {
    resetStore();
    const { container } = render(<Blanket visible />);
    const blanket = container.firstChild as HTMLElement;
    expect(blanket.style.background).toBe(scrimColor(defaultPalette).replace(/,(\S)/g, ", $1"));
    expect(blanket.style.opacity).toBe("0");
  });

  it("fades to opacity 1 after mount when visible", async () => {
    resetStore();
    const { container } = render(<Blanket visible />);
    const blanket = container.firstChild as HTMLElement;

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(blanket.style.opacity).toBe("1");
  });

  it("stays at opacity 0 when visible is false", async () => {
    resetStore();
    const { container } = render(<Blanket visible={false} />);
    const blanket = container.firstChild as HTMLElement;

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(blanket.style.opacity).toBe("0");
  });

  it("calls onClick when clicked", () => {
    resetStore();
    const onClick = vi.fn();
    const { container } = render(<Blanket onClick={onClick} />);
    const blanket = container.firstChild as HTMLElement;

    blanket.click();

    expect(onClick).toHaveBeenCalled();
  });
});
