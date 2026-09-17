import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { SidebarPluginItem } from "./SidebarPluginItem";
import { HoverIcon } from "../../components/HoverIcon/HoverIcon";
import { getCategoryIcon } from "./categoryIcons";
import type { CategoryDef } from "../../shared/category";

export function SidebarCategory({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const palette = useAppStore((s) => s.palette);
  const icon = getCategoryIcon(category.icon);

  return (
    <div>
      <button
        onClick={() => toggleCategory(category.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          padding: "6px 12px",
          border: "none",
          background: "transparent",
          color: palette.textMuted,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        <span>{expanded ? "▾" : "▸"}</span>
        {icon && <HoverIcon png={icon.png} gif={icon.gif} alt={category.name} size={14} />}
        <span>{category.name}</span>
      </button>
      {expanded && entries.map((entry) => <SidebarPluginItem key={entry.manifest.id} entry={entry} />)}
    </div>
  );
}
