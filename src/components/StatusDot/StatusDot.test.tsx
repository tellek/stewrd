/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StatusDot } from "./StatusDot";
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

describe("StatusDot", () => {
  it("renders a dot colored from the palette's status.success token", () => {
    resetStore();
    const { container } = render(<StatusDot color="success" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.background).toBe(hexToRgb(defaultPalette.status.success));
  });

  it("renders a different color for a different status token", () => {
    resetStore();
    const { container } = render(<StatusDot color="error" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.background).toBe(hexToRgb(defaultPalette.status.error));
  });
});
