import { useEffect, useState } from "react";
import type { BlanketProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { scrimColor } from "../shared/styles";

/** Fixed fade duration for the dimming overlay - deliberately not tied to a
 * Drawer/InlineDialog's own (often much faster) slide/scale speed, so the
 * darken/undarken always reads as a smooth 1s fade rather than a pop. */
const FADE_MS = 1000;

/** Plugin-facing primitive, exposed via api.ui.Blanket. Dims the content area
 * behind a Drawer/InlineDialog; scoped to the plugin's own container (not the
 * whole app) via `position: absolute` against the nearest positioned
 * ancestor - callers should avoid adding their own `position: relative`
 * wrapper around content they want fully covered, so it resolves against the
 * host's own content-area container instead. Clicking it fires `onClick`
 * (typically "close"). Pass `visible={false}` to fade it out - the caller is
 * responsible for not unmounting this component until after the fade
 * finishes (see Drawer/InlineDialog, which wait `Math.max(durationMs, 1000)`
 * before removing it from the tree). */
export function Blanket({ onClick, visible = true }: BlanketProps) {
  const palette = useAppStore((s) => s.palette);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        inset: 0,
        background: scrimColor(palette),
        opacity: visible && entered ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        zIndex: 10,
      }}
    />
  );
}
