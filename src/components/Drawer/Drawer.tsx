import { useEffect, useState } from "react";
import type { DrawerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { Blanket } from "../Blanket/Blanket";

const HIDDEN_TRANSFORM: Record<NonNullable<DrawerProps["side"]>, string> = {
  left: "translateX(-100%)",
  right: "translateX(100%)",
  top: "translateY(-100%)",
  bottom: "translateY(100%)",
};

/** Plugin-facing primitive, exposed via api.ui.Drawer. Slides in from `side`
 * of the plugin's own container (not the whole app). `size` controls how far
 * it extends (width for left/right, height for top/bottom) and `durationMs`
 * controls the slide speed. Stays mounted briefly after `open` goes false so
 * the close transition can play instead of popping out. */
export function Drawer({
  open,
  onClose,
  side = "right",
  size = 320,
  durationMs = 220,
  title,
  children,
}: DrawerProps) {
  const palette = useAppStore((s) => s.palette);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  if (!mounted) return null;

  const horizontal = side === "left" || side === "right";

  return (
    <>
      <Blanket onClick={onClose} durationMs={durationMs} />
      <div
        style={{
          position: "absolute",
          ...(horizontal
            ? { top: 0, bottom: 0, [side]: 0, width: size, maxWidth: "80%" }
            : { left: 0, right: 0, [side]: 0, height: size, maxHeight: "80%" }),
          background: palette.surface,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          padding: 16,
          overflowY: "auto",
          zIndex: 11,
          transform: visible ? "translate(0, 0)" : HIDDEN_TRANSFORM[side],
          transition: `transform ${durationMs}ms ease`,
        }}
      >
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        {children}
      </div>
    </>
  );
}
