import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { setPluginCategoryFile } from "../loader/pluginDiscovery";
import { StatusIcon } from "./StatusIcon";
import { usePluginIcon } from "./usePluginIcon";

export function SidebarPluginItem({ entry }: { entry: PluginSidebarEntry }) {
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const movePlugin = useAppStore((s) => s.movePlugin);
  const palette = useAppStore((s) => s.palette);
  const isActive = activePluginId === entry.manifest.id;
  const icon = usePluginIcon(entry.dir);
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === entry.manifest.id) return;
    const { categoryChanged, dir } = movePlugin(draggedId, entry.category, entry.manifest.id);
    if (categoryChanged) setPluginCategoryFile(dir, entry.category).catch(console.error);
  }

  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.manifest.id)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => setActivePlugin(entry.manifest.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 12px 6px 22px",
        border: "none",
        borderTop: dragOver ? `2px solid ${palette.accent}` : "2px solid transparent",
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
    </button>
  );
}
