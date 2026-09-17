import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarCategory } from "./SidebarCategory";
import { SidebarCategoryCollapsed } from "./SidebarCategoryCollapsed";
import { SidebarFooter } from "./SidebarFooter";
import { defaultPalette } from "../../shared/palette";

export function Sidebar() {
  const plugins = useAppStore((s) => s.plugins);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);

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
        width: sidebarCollapsed ? 48 : 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: defaultPalette.surface,
        borderRight: `1px solid ${defaultPalette.border}`,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {[...byCategory.entries()].map(([category, entries]) =>
          sidebarCollapsed ? (
            <SidebarCategoryCollapsed key={category} category={category} entries={entries} />
          ) : (
            <SidebarCategory key={category} category={category} entries={entries} />
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
            borderTop: `1px solid ${defaultPalette.border}`,
            background: "transparent",
            color: defaultPalette.textMuted,
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
