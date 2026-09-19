import { useAppStore } from "../state/appStore";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

const ICON_SIZE = 16;
const EMPTY_ITEMS: SidebarItem[] = [];

/** Renders a plugin's registered sidebar sub-items (api.sidebar.setItems)
 * indented beneath its row - a sibling of SidebarPluginItem, not nested
 * inside its <button>, so clicks don't bubble into the plugin row's own
 * drag/select handlers. Not shown in the collapsed sidebar rail. */
export function SidebarSubItems({ pluginId }: { pluginId: string }) {
  const items = useAppStore((s) => s.sidebarItemsByPlugin[pluginId] ?? EMPTY_ITEMS);
  const selectedId = useAppStore((s) => s.sidebarSelectedByPlugin[pluginId] ?? null);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const setSidebarSelected = useAppStore((s) => s.setSidebarSelected);
  const palette = useAppStore((s) => s.palette);

  if (items.length === 0) return null;

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
              cursor: "pointer",
            }}
          >
            {item.icon && <MaskIcon png={item.icon} alt={item.label} size={ICON_SIZE} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
