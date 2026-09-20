import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { promptModal } from "../api/modals";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";

const ICON_SIZE = 20;
const LAYOUT_NAME_MAX_LENGTH = 14;

async function promptSaveLayout(saveLayout: (name: string) => void) {
  const name = await promptModal({
    title: "Save Layout",
    message: `Name (max ${LAYOUT_NAME_MAX_LENGTH} characters)`,
    maxLength: LAYOUT_NAME_MAX_LENGTH,
  });
  if (name) saveLayout(name);
}

/** Sidebar section listing saved pane layouts, with a "Save" row pinned last.
 * Appears (via Sidebar.tsx) once a layout has been saved or more than one
 * pane is currently open. Deliberately simpler than SidebarCategory - no
 * drag-reorder, no plugin icon-file lookups, not persisted-expand-state
 * (always expanded). */
export function SidebarLayouts() {
  const layouts = useAppStore((s) => s.layouts);
  const applyLayout = useAppStore((s) => s.applyLayout);
  const saveLayout = useAppStore((s) => s.saveLayout);
  const deleteLayout = useAppStore((s) => s.deleteLayout);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, "diagram");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          color: palette.textMuted,
          fontSize: 16,
          fontWeight: "bold",
          textTransform: "capitalize",
          letterSpacing: 0.5,
        }}
      >
        {icon && <MaskIcon png={icon.png} alt="Layouts" size={ICON_SIZE} color={palette.textMuted} />}
        <span style={{ position: "relative", top: 2 }}>Layouts</span>
      </div>
      {layouts.map((layout) => (
        <button
          key={layout.id}
          onClick={() => applyLayout(layout.id)}
          onMouseEnter={() => setHoveredId(layout.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            width: "100%",
            textAlign: "left",
            padding: "6px 12px 6px 22px",
            border: "none",
            background: "transparent",
            color: hoveredId === layout.id ? palette.accent : palette.text,
            cursor: "pointer",
          }}
        >
          <span>{layout.name}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              deleteLayout(layout.id);
            }}
            title="Delete layout"
            style={{ color: palette.textMuted, cursor: "pointer", padding: "0 4px" }}
          >
            ✕
          </span>
        </button>
      ))}
      <button
        onClick={() => promptSaveLayout(saveLayout)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "6px 12px 6px 22px",
          border: "none",
          background: "transparent",
          color: palette.textMuted,
          cursor: "pointer",
        }}
      >
        Save
      </button>
    </div>
  );
}
