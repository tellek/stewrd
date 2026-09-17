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
          display: "flex",
          alignItems: "center",
          flex: 1,
          height: 32,
          textAlign: "left",
          padding: "0 12px",
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
          display: "flex",
          alignItems: "center",
          height: 32,
          padding: "0 12px",
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
