import { useState } from "react";
import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { usePluginIcon } from "./usePluginIcon";

export function SidebarPluginItem({ entry }: { entry: PluginSidebarEntry }) {
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const palette = useAppStore((s) => s.palette);
  const isActive = activePluginId === entry.manifest.id;
  const icon = usePluginIcon(entry.dir);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => setActivePlugin(entry.manifest.id)}
      style={{
        display: "flex",
        alignItems: "center",
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
      <StatusIcon status={entry.status} tooltip={entry.statusTooltip ?? entry.status} />
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        {icon.png && (
          <MaskIcon
            png={icon.png}
            alt={entry.manifest.name}
            size={24}
            color={hovered ? palette.accent : palette.text}
          />
        )}
        <span style={{ color: hovered ? palette.accent : undefined }}>{entry.manifest.name}</span>
      </span>
    </button>
  );
}
