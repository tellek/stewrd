import { describe, expect, it } from "vitest";
import { toIso, buildMonthGrid, stepMonth } from "./calendarGrid";

describe("toIso", () => {
  it("zero-pads the month and day", () => {
    expect(toIso(new Date(2024, 0, 5))).toBe("2024-01-05");
  });

  it("doesn't pad already two-digit month/day", () => {
    expect(toIso(new Date(2024, 10, 25))).toBe("2024-11-25");
  });
});

describe("buildMonthGrid", () => {
  it("has the correct leading blank count for a month starting mid-week", () => {
    // January 2024 starts on a Monday (day index 1).
    const grid = buildMonthGrid(2024, 0);
    const leadingBlanks = grid.findIndex((d) => d !== null);
    expect(leadingBlanks).toBe(new Date(2024, 0, 1).getDay());
  });

  it("has 31 day entries for a 31-day month", () => {
    const grid = buildMonthGrid(2024, 0);
    expect(grid.filter((d) => d !== null)).toHaveLength(31);
  });

  it("has 29 day entries for February in a leap year", () => {
    const grid = buildMonthGrid(2024, 1);
    expect(grid.filter((d) => d !== null)).toHaveLength(29);
  });

  it("has 28 day entries for February in a non-leap year", () => {
    const grid = buildMonthGrid(2023, 1);
    expect(grid.filter((d) => d !== null)).toHaveLength(28);
  });
});

describe("stepMonth", () => {
  it("rolls December + 1 to January of the next year", () => {
    expect(stepMonth(2023, 11, 1)).toEqual({ year: 2024, month: 0 });
  });

  it("rolls January - 1 to December of the previous year", () => {
    expect(stepMonth(2024, 0, -1)).toEqual({ year: 2023, month: 11 });
  });

  it("steps normally within a year", () => {
    expect(stepMonth(2024, 5, 1)).toEqual({ year: 2024, month: 6 });
  });
});
