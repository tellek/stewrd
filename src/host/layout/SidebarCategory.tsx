import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { defaultPalette } from "../../shared/palette";

export function SidebarCategory({ category, entries }: { category: string; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);

  return (
    <div>
      <button
        onClick={() => toggleCategory(category)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          padding: "6px 12px",
          border: "none",
          background: "transparent",
          color: defaultPalette.textMuted,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>{category}</span>
      </button>
      {expanded && entries.map((entry) => <SidebarPluginItem key={entry.manifest.id} entry={entry} />)}
    </div>
  );
}
