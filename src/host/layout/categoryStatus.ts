import type { PluginSidebarEntry } from "../state/appStore";
import type { Palette, StatusColor } from "../../shared/palette";

// Highest to lowest priority; "idle" isn't listed - it's the "normal" case,
// meaning no plugin in the category is calling for attention, so the icon
// just uses its normal (textMuted/text) tint instead of a status color.
export const STATUS_PRIORITY = ["error", "warning", "in-progress", "success"] as const;

/** The highest-priority status among all given plugins, or "idle" if every
 * plugin is idle (or there are no plugins). */
export function worstStatus(entries: PluginSidebarEntry[]): StatusColor {
  for (const level of STATUS_PRIORITY) {
    if (entries.some((e) => e.status === level)) return level;
  }
  return "idle";
}

/** The color a category's icon should be tinted, based on the
 * highest-priority status among all plugins currently in it. Falls back to
 * `normalColor` (the icon's usual tint) if every plugin is idle. */
export function categoryStatusColor(
  entries: PluginSidebarEntry[],
  palette: Palette,
  normalColor: string,
): string {
  const worst = worstStatus(entries);
  return worst === "idle" ? normalColor : palette.status[worst];
}
