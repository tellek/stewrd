import type { InlineDialogProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { Blanket } from "../Blanket/Blanket";

/** Plugin-facing primitive, exposed via api.ui.InlineDialog. A centered
 * confirm/info card scoped to the plugin's own container - use this instead
 * of `window.confirm`/a raw overlay. Renders nothing when `open` is false. */
export function InlineDialog({ open, onClose, title, message, children }: InlineDialogProps) {
  const palette = useAppStore((s) => s.palette);
  if (!open) return null;

  return (
    <>
      <Blanket onClick={onClose} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: palette.surface,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
          padding: 16,
          minWidth: 240,
          maxWidth: "80%",
          zIndex: 11,
        }}
      >
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        {message && <p>{message}</p>}
        {children}
      </div>
    </>
  );
}
