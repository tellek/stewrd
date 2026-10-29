/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsHelp } from "./SettingsHelp";

describe("SettingsHelp", () => {
  it("documents zoom, split panes, and resizing", () => {
    render(<SettingsHelp />);
    expect(screen.getByText("Zooming Tools")).toBeTruthy();
    expect(screen.getByText("Split Panes")).toBeTruthy();
    expect(screen.getByText("Resizing Panes")).toBeTruthy();
    expect(screen.getByText(/Hold Ctrl and scroll the mouse wheel/)).toBeTruthy();
  });
});
