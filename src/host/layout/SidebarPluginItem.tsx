import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { HoverIcon } from "../../components/HoverIcon/HoverIcon";
import { usePluginIcon } from "./usePluginIcon";

export function SidebarPluginItem({ entry }: { entry: PluginSidebarEntry }) {
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const palette = useAppStore((s) => s.palette);
  const isActive = activePluginId === entry.manifest.id;
  const icon = usePluginIcon(entry.dir);

  return (
    <button
      onClick={() => setActivePlugin(entry.manifest.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 12px 6px 28px",
        border: "none",
        background: isActive ? palette.surfaceHover : "transparent",
        color: palette.text,
        cursor: "pointer",
      }}
    >
      <StatusIcon status={entry.status} tooltip={entry.statusTooltip ?? entry.status} />
      {icon.png && <HoverIcon png={icon.png} gif={icon.gif} alt={entry.manifest.name} />}
      <span>{entry.manifest.name}</span>
    </button>
  );
}
