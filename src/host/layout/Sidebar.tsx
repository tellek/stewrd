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
import { LAYOUTS_CATEGORY_ID, resolveCategory, type CategoryDef } from "../../shared/category";

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
  // aren't rendered (no empty headers). LAYOUTS_CATEGORY_ID is excluded here -
  // it's a built-in category (orderable in Settings > Categories like any
  // other) but isn't a plugin bucket at all, so it's rendered specially below
  // instead of going through this plugin-grouping pass.
  const orderIndex = new Map(pluginOrder.map((id, i) => [id, i]));
  const byCategory = new Map<string, { def: CategoryDef; entries: PluginSidebarEntry[] }>();
  for (const entry of Object.values(plugins)) {
    const def = resolveCategory(categories, entry.category);
    if (def.id === LAYOUTS_CATEGORY_ID) continue;
    const bucket = byCategory.get(def.id) ?? { def, entries: [] };
    bucket.entries.push(entry);
    byCategory.set(def.id, bucket);
  }
  // Categories render in the order set via Settings > Categories (see the
  // render loop below); plugins within each render in the order set by
  // dragging in the sidebar.
  for (const bucket of byCategory.values()) {
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
        {categories.map((def) => {
          if (def.id === LAYOUTS_CATEGORY_ID) {
            // Rendered at this category's own position in Settings > Categories'
            // order (draggable like any other), but only shown once it has
            // something to show - same "no empty headers" rule as a plugin
            // category with zero matching entries.
            if (!showLayouts) return null;
            return sidebarCollapsed ? <SidebarLayoutsCollapsed key={def.id} /> : <SidebarLayouts key={def.id} />;
          }
          const bucket = byCategory.get(def.id);
          if (!bucket) return null;
          return sidebarCollapsed ? (
            <SidebarCategoryCollapsed key={def.id} category={bucket.def} entries={bucket.entries} />
          ) : (
            <SidebarCategory key={def.id} category={bucket.def} entries={bucket.entries} />
          );
        })}
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
