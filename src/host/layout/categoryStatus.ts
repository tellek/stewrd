import type { PluginSidebarEntry } from "../state/appStore";
import type { Palette } from "../../shared/palette";

// Highest to lowest priority; "idle" isn't listed - it's the "normal" case,
// meaning no plugin in the category is calling for attention, so the icon
// just uses its normal (textMuted/text) tint instead of a status color.
const STATUS_PRIORITY = ["error", "warning", "in-progress", "success"] as const;

/** The color a category's icon should be tinted, based on the
 * highest-priority status among all plugins currently in it. Falls back to
 * `normalColor` (the icon's usual tint) if every plugin is idle. */
export function categoryStatusColor(
  entries: PluginSidebarEntry[],
  palette: Palette,
  normalColor: string,
): string {
  for (const level of STATUS_PRIORITY) {
    if (entries.some((e) => e.status === level)) return palette.status[level];
  }
  return normalColor;
}
