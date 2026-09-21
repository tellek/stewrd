/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "./Link";
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

describe("Link", () => {
  it("renders the label and calls onClick when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Link label="Learn More" onClick={onClick} />);

    await user.click(screen.getByText("Learn More"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("colors the label from the palette's accent", () => {
    resetStore();
    render(<Link label="Learn More" onClick={() => {}} />);
    const el = screen.getByText("Learn More");
    expect(el.style.color).toBe(hexToRgb(defaultPalette.accent));
  });

  it("does not call onClick when disabled", () => {
    resetStore();
    const onClick = vi.fn();
    render(<Link label="Learn More" onClick={onClick} disabled />);

    fireEvent.click(screen.getByText("Learn More"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("underlines the label on hover but not disabled", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<Link label="Learn More" onClick={() => {}} />);
    const el = screen.getByText("Learn More");
    expect(el.style.textDecoration).toBe("none");

    await user.hover(el);
    expect(el.style.textDecoration).toBe("underline");
  });
});
