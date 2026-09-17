import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

// Height/padding here is kept in lockstep with StatusBar's collapsed summary
// row so the two read as one split bottom row (sidebar footer | status bar).
export function SidebarFooter() {
  const openSettings = useAppStore((s) => s.openSettings);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid ${defaultPalette.border}`,
        background: defaultPalette.surface,
        fontSize: 12,
      }}
    >
      <button
        onClick={openSettings}
        style={{
          flex: 1,
          textAlign: "left",
          padding: "4px 12px",
          border: "none",
          background: "transparent",
          color: defaultPalette.textMuted,
          cursor: "pointer",
        }}
      >
        Settings
      </button>
      <button
        onClick={toggleSidebarCollapsed}
        title="Collapse sidebar"
        style={{
          padding: "4px 12px",
          border: "none",
          background: "transparent",
          color: defaultPalette.textMuted,
          cursor: "pointer",
        }}
      >
        {"<<"}
      </button>
    </div>
  );
}
