import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarCategory } from "./SidebarCategory";
import { defaultPalette } from "../../shared/palette";

export function Sidebar() {
  const plugins = useAppStore((s) => s.plugins);

  // Categories are computed live from whatever plugins are discovered - a new
  // plugin folder can introduce a brand-new category with zero host changes.
  const byCategory = new Map<string, PluginSidebarEntry[]>();
  for (const entry of Object.values(plugins)) {
    const list = byCategory.get(entry.manifest.category) ?? [];
    list.push(entry);
    byCategory.set(entry.manifest.category, list);
  }

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        background: defaultPalette.surface,
        borderRight: `1px solid ${defaultPalette.border}`,
        overflowY: "auto",
      }}
    >
      {[...byCategory.entries()].map(([category, entries]) => (
        <SidebarCategory key={category} category={category} entries={entries} />
      ))}
    </nav>
  );
}
