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

/** Blanket's own fade is a fixed 1s regardless of the panel's `durationMs` -
 * unmounting must wait for whichever is longer so the dim doesn't pop away
 * mid-fade. */
const BLANKET_FADE_MS = 1000;

/** Plugin-facing primitive, exposed via api.ui.Drawer. Slides in from `side`
 * of the plugin's own container (not the whole app), and slides back out the
 * same side it came in - `side` is snapshotted into `activeSide` whenever
 * `open` goes true, so a caller changing/resetting `side` while closing
 * (e.g. computing it from the same state it derives `open` from) can't flip
 * the close direction mid-animation. `size` controls how far it extends
 * (width for left/right, height for top/bottom) and `durationMs` controls
 * the slide speed. Stays mounted briefly after `open` goes false so the close
 * transition can play instead of popping out. */
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
  const [activeSide, setActiveSide] = useState(side);

  useEffect(() => {
    if (open) {
      setActiveSide(side);
      setMounted(true);
      setVisible(false);
      // Two rAFs: the first lets the browser paint the "hidden" transform
      // (just-mounted state) before the second flips it to visible - a
      // single rAF can land before that first paint, collapsing the slide
      // into an instant pop-in.
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
  }, [open, side, durationMs]);

  if (!mounted) return null;

  const horizontal = activeSide === "left" || activeSide === "right";

  return (
    // Clips the panel's off-screen transform to this container's own bounds
    // instead of letting it bleed into the host's `<main>` (position:
    // relative, overflow: auto) - without this, translating the panel fully
    // off-screen still counts toward that ancestor's scrollable overflow,
    // flashing a scrollbar for the duration of the slide.
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Blanket onClick={onClose} visible={visible} />
      <div
        style={{
          position: "absolute",
          ...(horizontal
            ? { top: 0, bottom: 0, [activeSide]: 0, width: size, maxWidth: "80%" }
            : { left: 0, right: 0, [activeSide]: 0, height: size, maxHeight: "80%" }),
          background: palette.surface,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          padding: 16,
          overflowY: "auto",
          zIndex: 11,
          transform: visible ? "translate(0, 0)" : HIDDEN_TRANSFORM[activeSide],
          transition: `transform ${durationMs}ms ease`,
        }}
      >
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
