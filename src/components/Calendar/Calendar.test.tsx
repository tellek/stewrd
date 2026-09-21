/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "./Calendar";
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

describe("Calendar", () => {
  it("renders the month/year heading for the selected value's month", () => {
    resetStore();
    render(<Calendar value="2024-03-15" onChange={vi.fn()} />);
    expect(screen.getByText("March 2024")).toBeTruthy();
  });

  it("renders the current month/year when no value is provided", () => {
    resetStore();
    render(<Calendar value="" onChange={vi.fn()} />);
    const now = new Date();
    const expected = now.toLocaleString(undefined, { month: "long", year: "numeric" });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("calls onChange with the ISO date when a day is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Calendar value="2024-03-15" onChange={onChange} />);

    await user.click(screen.getByText("20"));

    expect(onChange).toHaveBeenCalledWith("2024-03-20");
  });

  it("highlights the selected day with the palette accent background", () => {
    resetStore();
    render(<Calendar value="2024-03-15" onChange={vi.fn()} />);
    const selectedCell = screen.getByText("15");
    expect(selectedCell.style.background).toBe(hexToRgb(defaultPalette.accent));
  });

  it("navigates to the next month when the '>' button is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<Calendar value="2024-03-15" onChange={vi.fn()} />);

    await user.click(screen.getByText(">"));

    expect(screen.getByText("April 2024")).toBeTruthy();
  });

  it("navigates to the previous month when the '<' button is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<Calendar value="2024-03-15" onChange={vi.fn()} />);

    await user.click(screen.getByText("<"));

    expect(screen.getByText("February 2024")).toBeTruthy();
  });

  it("rolls year over when navigating past December", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<Calendar value="2024-12-05" onChange={vi.fn()} />);

    await user.click(screen.getByText(">"));

    expect(screen.getByText("January 2025")).toBeTruthy();
  });

  it("outlines today's cell with the accent border when nothing is selected", () => {
    resetStore();
    render(<Calendar value="" onChange={vi.fn()} />);
    const todayDay = String(new Date().getDate());
    const todayCell = screen.getByText(todayDay);
    expect(todayCell.style.border).toBe(`1px solid ${hexToRgb(defaultPalette.accent)}`);
  });
});
