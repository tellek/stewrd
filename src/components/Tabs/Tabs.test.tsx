/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

const tabs = [
  { label: "General", value: "general" },
  { label: "Advanced", value: "advanced" },
];

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("Tabs", () => {
  it("renders a button for every tab with its label", () => {
    resetStore();
    render(<Tabs tabs={tabs} value="general" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeTruthy();
  });

  it("underlines the active tab with the palette's accent color", () => {
    resetStore();
    render(<Tabs tabs={tabs} value="advanced" onChange={vi.fn()} />);
    const active = screen.getByRole("button", { name: "Advanced" });
    const inactive = screen.getByRole("button", { name: "General" });
    expect(active.style.borderBottom).toContain(hexToRgb(defaultPalette.accent));
    expect(inactive.style.borderBottom).not.toContain(hexToRgb(defaultPalette.accent));
  });

  it("calls onChange with the clicked tab's value", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="general" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Advanced" }));

    expect(onChange).toHaveBeenCalledWith("advanced");
  });
});
