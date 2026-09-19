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

/** Icon-only rail variant of SidebarLayouts, mirroring
 * SidebarCategoryCollapsed - one icon per saved layout (title = name) plus a
 * "+" save button, shown when the sidebar is collapsed. */
export function SidebarLayoutsCollapsed() {
  const layouts = useAppStore((s) => s.layouts);
  const applyLayout = useAppStore((s) => s.applyLayout);
  const saveLayout = useAppStore((s) => s.saveLayout);
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const icon = getCategoryIcon(categoryIconFiles, "diagram");

  const buttonStyle = {
    display: "flex",
    justifyContent: "center",
    width: "100%",
    padding: "8px 0",
    border: "none",
    background: "transparent",
    color: palette.textMuted,
    cursor: "pointer",
  } as const;

  return (
    <div>
      {layouts.map((layout) => (
        <button key={layout.id} onClick={() => applyLayout(layout.id)} title={layout.name} style={buttonStyle}>
          {icon?.png ? <MaskIcon png={icon.png} alt={layout.name} size={ICON_SIZE} /> : <span>▪</span>}
        </button>
      ))}
      <button onClick={() => promptSaveLayout(saveLayout)} title="Save Layout" style={buttonStyle}>
        <span>+</span>
      </button>
    </div>
  );
}
