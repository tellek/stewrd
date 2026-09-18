import { describe, expect, it } from "vitest";
import { worstStatus } from "./categoryStatus";
import type { PluginSidebarEntry } from "../state/appStore";
import type { StatusColor } from "../../shared/palette";

function entry(status: StatusColor): PluginSidebarEntry {
  return {
    manifest: {
      id: "p",
      name: "P",
      version: "1.0.0",
      icon: "",
      entry: "",
      description: "",
      apiVersion: "1",
      background: false,
    },
    category: "other",
    status,
    dir: "p",
  };
}

describe("worstStatus", () => {
  it("returns idle for an empty list", () => {
    expect(worstStatus([])).toBe("idle");
  });

  it("returns idle when every plugin is idle", () => {
    expect(worstStatus([entry("idle"), entry("idle")])).toBe("idle");
  });

  it("picks the highest-priority status among mixed statuses", () => {
    expect(worstStatus([entry("success"), entry("warning"), entry("idle")])).toBe("warning");
    expect(worstStatus([entry("in-progress"), entry("error")])).toBe("error");
    expect(worstStatus([entry("success"), entry("in-progress")])).toBe("in-progress");
  });
});
