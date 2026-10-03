import type { PluginSidebarEntry } from "../state/appStore";
import type { Palette, StatusColor } from "../../shared/palette";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

// Highest to lowest priority; "idle" isn't listed - it's the "normal" case,
// meaning no plugin in the category is calling for attention, so the icon
// just uses its normal (textMuted/text) tint instead of a status color.
export const STATUS_PRIORITY = ["error", "warning", "in-progress", "success"] as const;

function worstOf(statuses: (StatusColor | undefined)[]): StatusColor {
  for (const level of STATUS_PRIORITY) {
    if (statuses.includes(level)) return level;
  }
  return "idle";
}

/** A plugin's own status if it isn't idle, otherwise the worst color among
 * its sidebar sub-item dots (with that item's label as the tooltip), else
 * "idle". Used for tool icons and, via `worstStatus`, category icons. */
export function effectiveStatus(
  entry: PluginSidebarEntry,
  items: SidebarItem[] = [],
): { status: StatusColor; tooltip?: string } {
  if (entry.status !== "idle") return { status: entry.status, tooltip: entry.statusTooltip };
  const status = worstOf(items.map((i) => i.color));
  if (status === "idle") return { status: "idle", tooltip: entry.statusTooltip };
  return { status, tooltip: items.find((i) => i.color === status)?.label };
}

/** The highest-priority status among all given plugins (including their
 * sub-item dots), or "idle" if every plugin is idle (or there are no plugins). */
export function worstStatus(
  entries: PluginSidebarEntry[],
  itemsByPlugin: Record<string, SidebarItem[]> = {},
): StatusColor {
  return worstOf(entries.map((e) => effectiveStatus(e, itemsByPlugin[e.manifest.id]).status));
}

/** The color a category's icon should be tinted, based on the
 * highest-priority status among all plugins currently in it. Falls back to
 * `normalColor` (the icon's usual tint) if every plugin is idle. */
export function categoryStatusColor(
  entries: PluginSidebarEntry[],
  palette: Palette,
  normalColor: string,
  itemsByPlugin: Record<string, SidebarItem[]> = {},
): string {
  const worst = worstStatus(entries, itemsByPlugin);
  return worst === "idle" ? normalColor : palette.status[worst];
}
