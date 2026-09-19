import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { setPluginCategoryFile } from "../loader/pluginDiscovery";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import { getCategoryIcon } from "./categoryIcons";
import { categoryStatusColor } from "./categoryStatus";
import type { CategoryDef } from "../../shared/category";

const ICON_SIZE = 20;

function SidebarItemSkeleton() {
  return (
    <div style={{ padding: "6px 12px 6px 22px" }}>
      <Skeleton height={20} />
    </div>
  );
}

export function SidebarCategory({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const movePlugin = useAppStore((s) => s.movePlugin);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, category.icon);
  const [hovered, setHovered] = useState(false);
  const iconColor = hovered ? palette.accent : categoryStatusColor(entries, palette, palette.textMuted);

  // Single source of truth for where the drop-preview skeleton renders while
  // dragging over this category: a plugin id (insert before it), "end"
  // (append to this category), or null (not currently a drop target).
  const [dropTarget, setDropTarget] = useState<string | "end" | null>(null);

  function applyMove(draggedId: string, beforeId: string | null) {
    setDropTarget(null);
    const { categoryChanged, dir } = movePlugin(draggedId, category.id, beforeId);
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
        <div>
          {entries.map((entry) => (
            <div key={entry.manifest.id}>
              {dropTarget === entry.manifest.id && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = e.dataTransfer.getData("text/plain");
                    if (draggedId) applyMove(draggedId, entry.manifest.id);
                  }}
                >
                  <SidebarItemSkeleton />
                </div>
              )}
              <SidebarPluginItem
                entry={entry}
                onDragOverItem={() => setDropTarget(entry.manifest.id)}
                onDropItem={(draggedId) => applyMove(draggedId, entry.manifest.id)}
                onDragEndItem={() => setDropTarget(null)}
              />
            </div>
          ))}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget("end");
            }}
            onDrop={(e) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData("text/plain");
              if (draggedId) applyMove(draggedId, null);
            }}
            style={{ minHeight: 8 }}
          >
            {dropTarget === "end" && <SidebarItemSkeleton />}
          </div>
        </div>
      )}
    </div>
  );
}
