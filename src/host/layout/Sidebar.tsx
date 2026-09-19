import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarCategory } from "./SidebarCategory";
import { SidebarCategoryCollapsed } from "./SidebarCategoryCollapsed";
import { SidebarLayouts } from "./SidebarLayouts";
import { SidebarLayoutsCollapsed } from "./SidebarLayoutsCollapsed";
import { SidebarFooter } from "./SidebarFooter";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";
import { countLeaves } from "../state/paneTree";
import { resolveCategory, type CategoryDef } from "../../shared/category";

const COLLAPSE_ICON_SIZE = 18;

export function Sidebar() {
  const plugins = useAppStore((s) => s.plugins);
  const categories = useAppStore((s) => s.categories);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const pluginOrder = useAppStore((s) => s.pluginOrder);
  const layouts = useAppStore((s) => s.layouts);
  const paneTree = useAppStore((s) => s.paneTree);
  const showLayouts = layouts.length > 0 || countLeaves(paneTree) > 1;
  const expandIcon = getCategoryIcon(categoryIconFiles, "fast-forward");
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const palette = useAppStore((s) => s.palette);
  const [expandHovered, setExpandHovered] = useState(false);

  // Plugins are grouped by resolving each entry's resolved category (from
  // settings.json, falling back to plugin.json) against the app-controlled
  // category list (Settings > Categories) - anything that doesn't match a
  // known category id falls into Other. Categories with no matching plugins
  // aren't rendered (no empty headers).
  const orderIndex = new Map(pluginOrder.map((id, i) => [id, i]));
  const byCategory = new Map<string, { def: CategoryDef; entries: PluginSidebarEntry[] }>();
  for (const entry of Object.values(plugins)) {
    const def = resolveCategory(categories, entry.category);
    const bucket = byCategory.get(def.id) ?? { def, entries: [] };
    bucket.entries.push(entry);
    byCategory.set(def.id, bucket);
  }
  // Categories render in the order set via Settings > Categories; plugins
  // within each render in the order set by dragging in the sidebar.
  const orderedBuckets = categories
    .map((def) => byCategory.get(def.id))
    .filter((bucket): bucket is { def: CategoryDef; entries: PluginSidebarEntry[] } => bucket !== undefined);
  for (const bucket of orderedBuckets) {
    bucket.entries.sort((a, b) => (orderIndex.get(a.manifest.id) ?? Infinity) - (orderIndex.get(b.manifest.id) ?? Infinity));
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
        {orderedBuckets.map(({ def, entries }) =>
          sidebarCollapsed ? (
            <SidebarCategoryCollapsed key={def.id} category={def} entries={entries} />
          ) : (
            <SidebarCategory key={def.id} category={def} entries={entries} />
          ),
        )}
        {showLayouts && (sidebarCollapsed ? <SidebarLayoutsCollapsed /> : <SidebarLayouts />)}
      </div>
      {sidebarCollapsed ? (
        <button
          onClick={toggleSidebarCollapsed}
          title="Expand sidebar"
          onMouseEnter={() => setExpandHovered(true)}
          onMouseLeave={() => setExpandHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 32,
            padding: 0,
            border: "none",
            borderTop: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.textMuted,
            cursor: "pointer",
          }}
        >
          {expandIcon && (
            <MaskIcon
              png={expandIcon.png}
              alt="Expand sidebar"
              size={COLLAPSE_ICON_SIZE}
              color={expandHovered ? palette.accent : palette.textMuted}
            />
          )}
        </button>
      ) : (
        <SidebarFooter />
      )}
    </nav>
  );
}
