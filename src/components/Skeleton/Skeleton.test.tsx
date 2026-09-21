/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Skeleton } from "./Skeleton";
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

describe("Skeleton", () => {
  it("defaults to full width and a 16px height", () => {
    resetStore();
    const { container } = render(<Skeleton />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.width).toBe("100%");
    expect(div.style.height).toBe("16px");
  });

  it("uses a custom width and height when provided", () => {
    resetStore();
    const { container } = render(<Skeleton width={200} height={40} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.width).toBe("200px");
    expect(div.style.height).toBe("40px");
  });

  it("builds the shimmer gradient from the palette's surface tokens", () => {
    resetStore();
    const { container } = render(<Skeleton />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toContain(hexToRgb(defaultPalette.surface));
    expect(div.style.background).toContain(hexToRgb(defaultPalette.surfaceHover));
  });
});
