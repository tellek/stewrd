import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { setPluginCategoryFile } from "../loader/pluginDiscovery";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";
import { categoryStatusColor } from "./categoryStatus";
import type { CategoryDef } from "../../shared/category";

const ICON_SIZE = 20;

export function SidebarCategory({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const movePlugin = useAppStore((s) => s.movePlugin);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, category.icon);
  const [hovered, setHovered] = useState(false);
  const iconColor = hovered ? palette.accent : categoryStatusColor(entries, palette, palette.textMuted);

  // Dropping in the gap below the last item (or into an empty category)
  // appends to the end of this category - per-item drops (SidebarPluginItem)
  // handle inserting before a specific item and stop propagation so this
  // handler only ever fires for the "end of list" case.
  function handleTrailingDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const { categoryChanged, dir } = movePlugin(draggedId, category.id, null);
    if (categoryChanged) setPluginCategoryFile(dir, category.id).catch(console.error);
  }

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
      {expanded && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={handleTrailingDrop} style={{ minHeight: 4 }}>
          {entries.map((entry) => (
            <SidebarPluginItem key={entry.manifest.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
