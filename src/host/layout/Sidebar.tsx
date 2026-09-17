import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarCategory } from "./SidebarCategory";
import { SidebarCategoryCollapsed } from "./SidebarCategoryCollapsed";
import { SidebarFooter } from "./SidebarFooter";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";
import { resolveCategory, type CategoryDef } from "../../shared/category";

const COLLAPSE_ICON_SIZE = 18;

export function Sidebar() {
  const plugins = useAppStore((s) => s.plugins);
  const categories = useAppStore((s) => s.categories);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const expandIcon = getCategoryIcon(categoryIconFiles, "fast-forward");
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const palette = useAppStore((s) => s.palette);
  const [expandHovered, setExpandHovered] = useState(false);

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
