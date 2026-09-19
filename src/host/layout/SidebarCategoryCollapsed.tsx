import { useAppStore, type PluginSidebarEntry } from "../state/appStore";
import { StatusIcon } from "./StatusIcon";
import { getCategoryIcon } from "./categoryIcons";
import { categoryStatusColor } from "./categoryStatus";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { usePluginIcon } from "./usePluginIcon";
import { findLeafForPlugin } from "../state/paneTree";
import type { CategoryDef } from "../../shared/category";

export function SidebarCategoryCollapsed({ category, entries }: { category: CategoryDef; entries: PluginSidebarEntry[] }) {
  const expanded = useAppStore((s) => s.categoriesExpanded[category.id] ?? true);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const activePaneId = useAppStore((s) => s.activePaneId);
  const paneTree = useAppStore((s) => s.paneTree);
  const setPaneTool = useAppStore((s) => s.setPaneTool);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, category.icon);
  const iconColor = categoryStatusColor(entries, palette, palette.textMuted);

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
          <MaskIcon png={icon.png} alt={category.name} size={24} color={iconColor} />
        ) : (
          <span>{expanded ? "▾" : "▸"}</span>
        )}
      </button>
      {expanded &&
        entries.map((entry) => (
          <CollapsedPluginButton
            key={entry.manifest.id}
            entry={entry}
            isActive={findLeafForPlugin(paneTree, entry.manifest.id)?.id === activePaneId}
            onClick={() => setPaneTool(activePaneId, entry.manifest.id)}
          />
        ))}
    </div>
  );
}

function CollapsedPluginButton({
  entry,
  isActive,
  onClick,
}: {
  entry: PluginSidebarEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const palette = useAppStore((s) => s.palette);
  const icon = usePluginIcon(entry.dir);

  return (
    <button
      onClick={onClick}
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
      <StatusIcon
        status={entry.status}
        tooltip={entry.statusTooltip ?? entry.status}
        png={icon.png}
        alt={entry.manifest.name}
      />
    </button>
  );
}
