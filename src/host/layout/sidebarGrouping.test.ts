import { describe, expect, it } from "vitest";
import { groupPluginsByCategory } from "./sidebarGrouping";
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_ID } from "../../shared/category";
import type { PluginSidebarEntry } from "../state/appStore";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

function entry(id: string, category: string): PluginSidebarEntry {
  return {
    manifest: { id, name: id, icon: "", entry: "", description: "", apiVersion: "1", background: false } as PluginManifest,
    status: "idle",
    dir: id,
    category,
  } as PluginSidebarEntry;
}

describe("groupPluginsByCategory", () => {
  it("falls plugins with an unknown category id into Other", () => {
    const plugins = { a: entry("a", "NoSuchCategory") };
    const result = groupPluginsByCategory(plugins, DEFAULT_CATEGORIES, []);
    expect(result.get(OTHER_CATEGORY_ID)?.entries.map((e) => e.manifest.id)).toEqual(["a"]);
  });

  it("omits a category with zero matching plugins", () => {
    const plugins = { a: entry("a", "Utilities") };
    const result = groupPluginsByCategory(plugins, DEFAULT_CATEGORIES, []);
    expect(result.has("Templates")).toBe(false);
  });

  it("sorts entries within a category by pluginOrder, unlisted ids sorting last", () => {
    const plugins = {
      a: entry("a", "Utilities"),
      b: entry("b", "Utilities"),
      c: entry("c", "Utilities"),
    };
    const result = groupPluginsByCategory(plugins, DEFAULT_CATEGORIES, ["c", "a"]);
    expect(result.get("Utilities")?.entries.map((e) => e.manifest.id)).toEqual(["c", "a", "b"]);
  });
});
