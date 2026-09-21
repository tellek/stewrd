/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconTextButton } from "./IconTextButton";
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

describe("IconTextButton", () => {
  it("renders the label and calls onClick when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconTextButton icon="data:image/png;base64,abc" label="Open Folder" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Open Folder" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses the accent background for the primary variant", () => {
    resetStore();
    render(<IconTextButton icon="data:image/png;base64,abc" label="Save" onClick={() => {}} variant="primary" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.style.background).toBe(hexToRgb(defaultPalette.accent));
  });

  it("is disabled when disabled is true", () => {
    resetStore();
    render(<IconTextButton icon="data:image/png;base64,abc" label="Save" onClick={() => {}} disabled />);
    const button = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
