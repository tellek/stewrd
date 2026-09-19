import type { DrawerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { Blanket } from "../Blanket/Blanket";

/** Plugin-facing primitive, exposed via api.ui.Drawer. Slides in from `side`
 * of the plugin's own container (not the whole app) - renders nothing when
 * `open` is false. */
export function Drawer({ open, onClose, side = "right", title, children }: DrawerProps) {
  const palette = useAppStore((s) => s.palette);
  if (!open) return null;

  return (
    <>
      <Blanket onClick={onClose} />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [side]: 0,
          width: 320,
          maxWidth: "80%",
          background: palette.surface,
          color: palette.text,
          borderLeft: side === "right" ? `1px solid ${palette.border}` : undefined,
          borderRight: side === "left" ? `1px solid ${palette.border}` : undefined,
          padding: 16,
          overflowY: "auto",
          zIndex: 11,
        }}
      >
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        {children}
      </div>
    </>
  );
}
