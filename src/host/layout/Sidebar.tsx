import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarCategory } from "./SidebarCategory";
import { SidebarCategoryCollapsed } from "./SidebarCategoryCollapsed";
import { SidebarFooter } from "./SidebarFooter";
import { resolveCategory, type CategoryDef } from "../../shared/category";

export function Sidebar() {
  const plugins = useAppStore((s) => s.plugins);
  const categories = useAppStore((s) => s.categories);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const palette = useAppStore((s) => s.palette);

  // Plugins are grouped by resolving each manifest.category against the
  // app-controlled category list (Settings > Categories) - anything that
  // doesn't match a known category id falls into Other. Categories with no
  // matching plugins aren't rendered (no empty headers).
  const byCategory = new Map<string, { def: CategoryDef; entries: PluginSidebarEntry[] }>();
  for (const entry of Object.values(plugins)) {
    const def = resolveCategory(categories, entry.manifest.category);
    const bucket = byCategory.get(def.id) ?? { def, entries: [] };
    bucket.entries.push(entry);
    byCategory.set(def.id, bucket);
  }

  return (
    <nav
      style={{
        width: sidebarCollapsed ? 48 : 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: palette.surface,
        borderRight: `1px solid ${palette.border}`,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {[...byCategory.values()].map(({ def, entries }) =>
          sidebarCollapsed ? (
            <SidebarCategoryCollapsed key={def.id} category={def} entries={entries} />
          ) : (
            <SidebarCategory key={def.id} category={def} entries={entries} />
          ),
        )}
      </div>
      {sidebarCollapsed ? (
        <button
          onClick={toggleSidebarCollapsed}
          title="Expand sidebar"
          style={{
            padding: "4px 0",
            border: "none",
            borderTop: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.textMuted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {">>"}
        </button>
      ) : (
        <SidebarFooter />
      )}
    </nav>
  );
}
