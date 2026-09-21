/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StatusIcon } from "./StatusIcon";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, categoryIconFiles: [] });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("StatusIcon", () => {
  it("renders the outer wrapper even with no icon png available", () => {
    resetStore();
    const { container } = render(<StatusIcon status="idle" alt="Notepad" />);
    expect(container.firstChild).toBeTruthy();
  });

  it("tints the icon with the palette's status color when a png and non-idle status are set", () => {
    resetStore();
    const { container } = render(<StatusIcon status="error" alt="Notepad" png="icon.png" />);
    const icon = container.querySelector('span[role="img"]') as HTMLElement;
    expect(icon.style.backgroundColor).toBe(hexToRgb(defaultPalette.status.error));
  });

  it("tints the icon with the idle color (default textMuted) when status is idle", () => {
    resetStore();
    const { container } = render(<StatusIcon status="idle" alt="Notepad" png="icon.png" />);
    const icon = container.querySelector('span[role="img"]') as HTMLElement;
    expect(icon.style.backgroundColor).toBe(hexToRgb(defaultPalette.textMuted));
  });

  it("uses a custom idleColor when provided and status is idle", () => {
    resetStore();
    const { container } = render(
      <StatusIcon status="idle" alt="Notepad" png="icon.png" idleColor={defaultPalette.accent} />,
    );
    const icon = container.querySelector('span[role="img"]') as HTMLElement;
    expect(icon.style.backgroundColor).toBe(hexToRgb(defaultPalette.accent));
  });

  it("sets the tooltip title from the tooltip prop on the outer wrapper", () => {
    resetStore();
    const { container } = render(<StatusIcon status="error" alt="Notepad" tooltip="crashed" />);
    const span = container.firstChild as HTMLElement;
    expect(span.getAttribute("title")).toBe("crashed");
  });
});
