import { useEffect, useState } from "react";
import type { InlineDialogProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { Blanket } from "../Blanket/Blanket";

/** Blanket's own fade is a fixed 1s regardless of the dialog's own
 * `durationMs` - unmounting must wait for whichever is longer so the dim
 * doesn't pop away mid-fade. */
const BLANKET_FADE_MS = 1000;

/** Plugin-facing primitive, exposed via api.ui.InlineDialog. A centered
 * confirm/info card scoped to the plugin's own container - use this instead
 * of `window.confirm`/a raw overlay. Stays mounted briefly after `open` goes
 * false so the fade-out can play. */
export function InlineDialog({ open, onClose, durationMs = 220, title, message, children }: InlineDialogProps) {
  const palette = useAppStore((s) => s.palette);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setVisible(false);
      const pending = { raf2: 0 };
      const raf1 = requestAnimationFrame(() => {
        pending.raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(pending.raf2);
      };
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), Math.max(durationMs, BLANKET_FADE_MS));
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  if (!mounted) return null;

  return (
    <>
      <Blanket onClick={onClose} visible={visible} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: visible ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.95)",
          opacity: visible ? 1 : 0,
          transition: `transform ${durationMs}ms ease, opacity ${durationMs}ms ease`,
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
