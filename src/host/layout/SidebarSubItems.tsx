import { useAppStore } from "../state/appStore";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

const ICON_SIZE = 14;
const EMPTY_ITEMS: SidebarItem[] = [];

/** Renders a plugin's registered sidebar sub-items (api.sidebar.setItems)
 * indented beneath its row - a sibling of SidebarPluginItem, not nested
 * inside its <button>, so clicks don't bubble into the plugin row's own
 * drag/select handlers. Not shown in the collapsed sidebar rail. Expand/
 * collapse is toggled only by clicking the plugin's own row while it's
 * already the active selection (SidebarPluginItem.tsx). */
export function SidebarSubItems({ pluginId }: { pluginId: string }) {
  const items = useAppStore((s) => s.sidebarItemsByPlugin[pluginId] ?? EMPTY_ITEMS);
  const selectedId = useAppStore((s) => s.sidebarSelectedByPlugin[pluginId] ?? null);
  const expanded = useAppStore((s) => s.sidebarSubItemsExpanded[pluginId] ?? true);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const setSidebarSelected = useAppStore((s) => s.setSidebarSelected);
  const palette = useAppStore((s) => s.palette);

  if (items.length === 0 || !expanded) return null;

  return (
    <div>
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            onClick={(e) => {
              e.stopPropagation();
              setActivePlugin(pluginId);
              setSidebarSelected(pluginId, item.id);
              item.onClick();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "5px 12px 5px 34px",
              border: "none",
              background: isSelected ? palette.surfaceHover : "transparent",
              color: isSelected ? palette.accent : palette.textMuted,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: item.color ? palette.status[item.color] : palette.textMuted,
                flexShrink: 0,
              }}
            />
            {item.icon && <MaskIcon png={item.icon} alt={item.label} size={ICON_SIZE} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
