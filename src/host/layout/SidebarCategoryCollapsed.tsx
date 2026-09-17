import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { getCategoryIcon } from "./categoryIcons";
import { HoverIcon } from "../../components/HoverIcon/HoverIcon";
import type { CategoryDef } from "../../shared/category";

export function SidebarCategoryCollapsed({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, category.icon);

  return (
    <div>
      <button
        onClick={() => toggleCategory(category.id)}
        title={category.name}
        style={{
          display: "flex",
          justifyContent: "center",
          width: "100%",
          padding: "8px 0",
          border: "none",
          background: "transparent",
          color: palette.textMuted,
          cursor: "pointer",
        }}
      >
        {icon?.png ? (
          <HoverIcon png={icon.png} gif={icon.gif} alt={category.name} />
        ) : (
          <span>{expanded ? "▾" : "▸"}</span>
        )}
      </button>
      {expanded &&
        entries.map((entry) => {
          const isActive = activePluginId === entry.manifest.id;
          return (
            <button
              key={entry.manifest.id}
              onClick={() => setActivePlugin(entry.manifest.id)}
              title={entry.manifest.name}
              style={{
                display: "flex",
                justifyContent: "center",
                width: "100%",
                padding: "8px 0",
                border: "none",
                background: isActive ? palette.surfaceHover : "transparent",
                cursor: "pointer",
              }}
            >
              <StatusIcon status={entry.status} tooltip={entry.statusTooltip ?? entry.status} />
            </button>
          );
        })}
    </div>
  );
}
