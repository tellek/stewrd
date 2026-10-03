import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { usePluginIcon } from "./usePluginIcon";
import { effectiveStatus } from "./categoryStatus";
import { findLeaf } from "../state/paneTree";
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
  const activePaneId = useAppStore((s) => s.activePaneId);
  const view = useAppStore((s) => s.view);
  const paneTree = useAppStore((s) => s.paneTree);
  const focusOrOpenPlugin = useAppStore((s) => s.focusOrOpenPlugin);
  const setDraggingPlugin = useAppStore((s) => s.setDraggingPlugin);
  const toggleSidebarSubItemsExpanded = useAppStore((s) => s.toggleSidebarSubItemsExpanded);
  const items = useAppStore((s) => s.sidebarItemsByPlugin[entry.manifest.id] ?? EMPTY_ITEMS);
  const expanded = useAppStore((s) => s.sidebarSubItemsExpanded[entry.manifest.id] ?? true);
  const palette = useAppStore((s) => s.palette);
  const isActive = view === "plugin" && findLeaf(paneTree, activePaneId)?.pluginId === entry.manifest.id;
  const icon = usePluginIcon(entry.dir);
  const effective = effectiveStatus(entry, items);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", entry.manifest.id);
        setDraggingPlugin(entry.manifest.id);
      }}
      onDragEnd={() => {
        setDraggingPlugin(null);
        onDragEndItem();
      }}
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
      onClick={() =>
        isActive
          ? toggleSidebarSubItemsExpanded(entry.manifest.id)
          : focusOrOpenPlugin(activePaneId, entry.manifest.id)
      }
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "3px 12px 3px 22px",
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
          status={effective.status}
          tooltip={effective.tooltip ?? effective.status}
          png={icon.png}
          alt={entry.manifest.name}
          idleColor={hovered ? palette.accent : palette.text}
        />
        <span style={{ color: hovered ? palette.accent : undefined }}>{entry.manifest.name}</span>
      </span>
      {items.length > 0 && (
        // Its own click target (stopPropagation, so it doesn't also fire the
        // row's select/toggle-if-active onClick above) - toggles regardless
        // of active state. Only shown once the plugin has sub-items to expand.
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (!isActive) focusOrOpenPlugin(activePaneId, entry.manifest.id);
            toggleSidebarSubItemsExpanded(entry.manifest.id);
          }}
          style={{ color: palette.textMuted, cursor: "pointer", padding: "0 4px" }}
        >
          {items.length > 0 && expanded ? "▾" : "▸"}
        </span>
      )}
    </button>
  );
}
