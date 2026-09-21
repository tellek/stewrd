/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextButton } from "./TextButton";
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

describe("TextButton", () => {
  it("renders the label and calls onClick when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TextButton label="Save Changes" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Save Changes" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses the accent background for the primary variant", () => {
    resetStore();
    render(<TextButton label="Confirm" onClick={() => {}} variant="primary" />);
    const button = screen.getByRole("button", { name: "Confirm" });
    expect(button.style.background).toBe(hexToRgb(defaultPalette.accent));
  });

  it("uses the surface background for the default secondary variant", () => {
    resetStore();
    render(<TextButton label="Cancel" onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.style.background).toBe(hexToRgb(defaultPalette.surface));
  });

  it("is disabled and does not call onClick when disabled is true", () => {
    resetStore();
    const onClick = vi.fn();
    render(<TextButton label="Delete" onClick={onClick} disabled />);

    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
