import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { usePluginIcon } from "./usePluginIcon";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

const EMPTY_ITEMS: SidebarItem[] = [];

export function SidebarPluginItem({
  entry,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
}: {
  entry: PluginSidebarEntry;
  /** Called with (preventDefault already applied) whenever a drag hovers this item -
   * parent (SidebarCategory) uses this to track which item to preview a drop before. */
  onDragOverItem: () => void;
  /** Called with the dragged plugin id from dataTransfer - parent applies the move. */
  onDropItem: (draggedId: string) => void;
  /** Fires on the dragged item itself when the drag ends (dropped or cancelled) -
   * parent uses this to clear its drop-target preview even on a cancelled drag. */
  onDragEndItem: () => void;
}) {
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const toggleSidebarSubItemsExpanded = useAppStore((s) => s.toggleSidebarSubItemsExpanded);
  const items = useAppStore((s) => s.sidebarItemsByPlugin[entry.manifest.id] ?? EMPTY_ITEMS);
  const expanded = useAppStore((s) => s.sidebarSubItemsExpanded[entry.manifest.id] ?? true);
  // Also recognize a plugin known (from a past setItems call, persisted via
  // hostSettings) to have sub-items, so a lazy plugin's disclosure triangle
  // shows at startup even before it's activated this session.
  const knownExpandable = useAppStore((s) => s.pluginsWithSidebarItems.includes(entry.manifest.id));
  const palette = useAppStore((s) => s.palette);
  const isActive = activePluginId === entry.manifest.id;
  const icon = usePluginIcon(entry.dir);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.manifest.id)}
      onDragEnd={onDragEndItem}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOverItem();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId) onDropItem(draggedId);
      }}
      onClick={() => (isActive ? toggleSidebarSubItemsExpanded(entry.manifest.id) : setActivePlugin(entry.manifest.id))}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 12px 6px 22px",
        border: "none",
        background: isActive ? palette.surfaceHover : "transparent",
        color: palette.text,
        cursor: "pointer",
      }}
    >
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <StatusIcon
          status={entry.status}
          tooltip={entry.statusTooltip ?? entry.status}
          png={icon.png}
          alt={entry.manifest.name}
          idleColor={hovered ? palette.accent : palette.text}
        />
        <span style={{ color: hovered ? palette.accent : undefined }}>{entry.manifest.name}</span>
      </span>
      {(items.length > 0 || knownExpandable) && (
        <span style={{ color: palette.textMuted }}>{expanded ? "▾" : "▸"}</span>
      )}
    </button>
  );
}
