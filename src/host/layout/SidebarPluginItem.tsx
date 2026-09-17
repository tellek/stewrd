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
      {icon.png && <MaskIcon png={icon.png} alt={entry.manifest.name} size={24} color={palette.text} />}
      <span>{entry.manifest.name}</span>
    </button>
  );
}
