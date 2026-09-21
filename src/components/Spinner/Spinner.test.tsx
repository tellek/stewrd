/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Spinner } from "./Spinner";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("Spinner", () => {
  it("defaults to a 20px square", () => {
    resetStore();
    const { container } = render(<Spinner />);
    const span = container.querySelector("span") as HTMLElement;
    expect(span.style.width).toBe("20px");
    expect(span.style.height).toBe("20px");
  });

  it("uses a custom size when provided", () => {
    resetStore();
    const { container } = render(<Spinner size={40} />);
    const span = container.querySelector("span") as HTMLElement;
    expect(span.style.width).toBe("40px");
    expect(span.style.height).toBe("40px");
  });

  it("colors the spinning edge from the palette's accent", () => {
    resetStore();
    const { container } = render(<Spinner />);
    const span = container.querySelector("span") as HTMLElement;
    expect(span.style.borderTopColor).toBe(hexToRgb(defaultPalette.accent));
  });
});
