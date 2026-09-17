import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";
import { categoryStatusColor } from "./categoryStatus";
import type { CategoryDef } from "../../shared/category";

const ICON_SIZE = 20;

export function SidebarCategory({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, category.icon);
  const [hovered, setHovered] = useState(false);
  const iconColor = hovered ? palette.accent : categoryStatusColor(entries, palette, palette.textMuted);

  return (
    <div>
      <button
        onClick={() => toggleCategory(category.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          textAlign: "left",
          padding: "6px 12px",
          border: "none",
          background: "transparent",
          color: palette.textMuted,
          fontSize: 16,
          fontWeight: "bold",
          textTransform: "capitalize",
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        <span
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ display: "flex", alignItems: "center", gap: 6, height: ICON_SIZE }}
        >
          {icon && <MaskIcon png={icon.png} alt={category.name} size={ICON_SIZE} color={iconColor} />}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              height: ICON_SIZE,
              position: "relative",
              top: 2,
              color: hovered ? palette.accent : undefined,
            }}
          >
            {category.name}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", height: ICON_SIZE }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && entries.map((entry) => <SidebarPluginItem key={entry.manifest.id} entry={entry} />)}
    </div>
  );
}
