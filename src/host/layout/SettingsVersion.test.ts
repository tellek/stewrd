import { describe, expect, it } from "vitest";
import { compareVersions } from "./SettingsVersion";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns a positive number when a is newer than b", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBeGreaterThan(0);
  });

  it("returns a negative number when a is older than b", () => {
    expect(compareVersions("1.2.0", "1.3.0")).toBeLessThan(0);
  });

  it("treats a missing patch component as 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("compares a version with more components than the other correctly", () => {
    expect(compareVersions("1.2.0.1", "1.2.0")).toBeGreaterThan(0);
  });
});
