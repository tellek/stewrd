import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { defaultPalette } from "../../shared/palette";

export function SidebarPluginItem({ entry }: { entry: PluginSidebarEntry }) {
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const isActive = activePluginId === entry.manifest.id;

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
        background: isActive ? defaultPalette.surfaceHover : "transparent",
        color: defaultPalette.text,
        cursor: "pointer",
      }}
    >
      <StatusIcon status={entry.status} tooltip={entry.statusTooltip ?? entry.status} />
      <span>{entry.manifest.name}</span>
    </button>
  );
}
