import type { PluginSidebarEntry } from "../state/appStore";
import { LAYOUTS_CATEGORY_ID, resolveCategory, type CategoryDef } from "../../shared/category";

/** Groups sidebar plugin entries by resolved category (from settings.json,
 * falling back to plugin.json) against the app-controlled category list
 * (Settings > Categories) - anything that doesn't match a known category id
 * falls into Other. Categories with no matching plugins aren't included (no
 * empty headers). LAYOUTS_CATEGORY_ID is excluded - it's a built-in category
 * but isn't a plugin bucket at all; the Layouts section is rendered
 * separately. Within each category, entries are sorted by `pluginOrder`
 * (unlisted ids sort after everything listed). */
export function groupPluginsByCategory(
  plugins: Record<string, PluginSidebarEntry>,
  categories: CategoryDef[],
  pluginOrder: string[],
): Map<string, { def: CategoryDef; entries: PluginSidebarEntry[] }> {
  const orderIndex = new Map(pluginOrder.map((id, i) => [id, i]));
  const byCategory = new Map<string, { def: CategoryDef; entries: PluginSidebarEntry[] }>();
  for (const entry of Object.values(plugins)) {
    const def = resolveCategory(categories, entry.category);
    if (def.id === LAYOUTS_CATEGORY_ID) continue;
    const bucket = byCategory.get(def.id) ?? { def, entries: [] };
    bucket.entries.push(entry);
    byCategory.set(def.id, bucket);
  }
  for (const bucket of byCategory.values()) {
    bucket.entries.sort((a, b) => (orderIndex.get(a.manifest.id) ?? Infinity) - (orderIndex.get(b.manifest.id) ?? Infinity));
  }
  return byCategory;
}
