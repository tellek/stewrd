import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { getCategoryIcon } from "./categoryIcons";

const COLLAPSE_ICON_SIZE = 18;

// Height/padding here is kept in lockstep with StatusBar's collapsed summary
// row so the two read as one split bottom row (sidebar footer | status bar).
export function SidebarFooter() {
  const openSettings = useAppStore((s) => s.openSettings);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const palette = useAppStore((s) => s.palette);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const collapseIcon = getCategoryIcon(categoryIconFiles, sidebarCollapsed ? "fast-forward" : "fast-backward");
  const settingsIcon = getCategoryIcon(categoryIconFiles, "settings");
  const [settingsHovered, setSettingsHovered] = useState(false);
  const [collapseHovered, setCollapseHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid ${palette.border}`,
        background: palette.surface,
        fontSize: 12,
      }}
    >
      <button
        onClick={openSettings}
        onMouseEnter={() => setSettingsHovered(true)}
        onMouseLeave={() => setSettingsHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          height: 32,
          textAlign: "left",
          padding: "0 12px",
          border: "none",
          background: "transparent",
          color: settingsHovered ? palette.accent : palette.textMuted,
          cursor: "pointer",
        }}
      >
        {settingsIcon && (
          <MaskIcon
            png={settingsIcon.png}
            alt=""
            size={COLLAPSE_ICON_SIZE}
            color={settingsHovered ? palette.accent : palette.textMuted}
          />
        )}
        Settings
      </button>
      <button
        onClick={toggleSidebarCollapsed}
        title="Collapse sidebar"
        onMouseEnter={() => setCollapseHovered(true)}
        onMouseLeave={() => setCollapseHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          padding: "0 12px",
          border: "none",
          background: "transparent",
          color: palette.textMuted,
          cursor: "pointer",
        }}
      >
        {collapseIcon && (
          <MaskIcon
            png={collapseIcon.png}
            alt={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            size={COLLAPSE_ICON_SIZE}
            color={collapseHovered ? palette.accent : palette.textMuted}
          />
        )}
      </button>
    </div>
  );
}
