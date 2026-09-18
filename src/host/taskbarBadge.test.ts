import { describe, expect, it } from "vitest";
import { shouldShowBadge } from "./taskbarBadge";
import type { StatusColor } from "../shared/palette";

const ALL_STATUSES: StatusColor[] = ["idle", "in-progress", "success", "warning", "error"];

describe("shouldShowBadge", () => {
  it("never shows a badge when threshold is off", () => {
    for (const status of ALL_STATUSES) {
      expect(shouldShowBadge(status, "off")).toBe(false);
    }
  });

  it("threshold 'error' only shows for error", () => {
    expect(shouldShowBadge("error", "error")).toBe(true);
    expect(shouldShowBadge("warning", "error")).toBe(false);
    expect(shouldShowBadge("idle", "error")).toBe(false);
  });

  it("threshold 'warning' shows for warning or error", () => {
    expect(shouldShowBadge("error", "warning")).toBe(true);
    expect(shouldShowBadge("warning", "warning")).toBe(true);
    expect(shouldShowBadge("in-progress", "warning")).toBe(false);
    expect(shouldShowBadge("success", "warning")).toBe(false);
    expect(shouldShowBadge("idle", "warning")).toBe(false);
  });

  it("threshold 'success' shows for anything but idle", () => {
    expect(shouldShowBadge("error", "success")).toBe(true);
    expect(shouldShowBadge("warning", "success")).toBe(true);
    expect(shouldShowBadge("in-progress", "success")).toBe(true);
    expect(shouldShowBadge("success", "success")).toBe(true);
    expect(shouldShowBadge("idle", "success")).toBe(false);
  });
});
