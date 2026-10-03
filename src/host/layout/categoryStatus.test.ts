import { describe, expect, it } from "vitest";
import { categoryStatusColor, effectiveStatus, worstStatus } from "./categoryStatus";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";
import type { PluginSidebarEntry } from "../state/appStore";
import { premadePalettes, type StatusColor } from "../../shared/palette";

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

describe("categoryStatusColor", () => {
  const palette = premadePalettes[0].colors;

  it("returns the normal color when every plugin is idle", () => {
    expect(categoryStatusColor([entry("idle")], palette, palette.textMuted)).toBe(palette.textMuted);
  });

  it("returns the status color for the worst status among plugins", () => {
    expect(categoryStatusColor([entry("warning"), entry("idle")], palette, palette.textMuted)).toBe(
      palette.status.warning,
    );
  });

  it("returns the normal color for an empty list", () => {
    expect(categoryStatusColor([], palette, palette.text)).toBe(palette.text);
  });
});

function item(color?: StatusColor, label = "i"): SidebarItem {
  return { id: label, label, color, onClick: () => {} };
}

describe("effectiveStatus", () => {
  it("keeps a non-idle plugin status", () => {
    expect(effectiveStatus(entry("warning"), [item("error")]).status).toBe("warning");
  });

  it("uses the worst sub-item color when the plugin is idle", () => {
    const r = effectiveStatus(entry("idle"), [item("success", "a"), item("error", "b")]);
    expect(r).toEqual({ status: "error", tooltip: "b" });
  });

  it("is idle with no sub-item colors", () => {
    expect(effectiveStatus(entry("idle"), [item()]).status).toBe("idle");
  });
});

describe("sub-item dots feed categories", () => {
  it("worstStatus includes sub-item colors", () => {
    expect(worstStatus([entry("idle")], { p: [item("warning")] })).toBe("warning");
  });
});
