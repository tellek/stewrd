import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { getCategoryIcon } from "./categoryIcons";
import { defaultPalette } from "../../shared/palette";

export function SidebarCategoryCollapsed({ category, entries }: { category: string; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const activePluginId = useAppStore((s) => s.activePluginId);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const icon = getCategoryIcon(category);

  return (
    <div>
      <button
        onClick={() => toggleCategory(category)}
        title={category}
        style={{
          display: "flex",
          justifyContent: "center",
          width: "100%",
          padding: "8px 0",
          border: "none",
          background: "transparent",
          color: defaultPalette.textMuted,
          cursor: "pointer",
        }}
      >
        {icon ? <img src={icon} alt={category} width={16} height={16} /> : <span>{expanded ? "▾" : "▸"}</span>}
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
                background: isActive ? defaultPalette.surfaceHover : "transparent",
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
