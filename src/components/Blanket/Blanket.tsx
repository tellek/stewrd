import { useEffect, useState } from "react";
import type { BlanketProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { scrimColor } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Blanket. Dims the content area
 * behind a Drawer/InlineDialog; scoped to the plugin's own container (not the
 * whole app) via `position: absolute` against the nearest positioned
 * ancestor - callers should avoid adding their own `position: relative`
 * wrapper around content they want fully covered, so it resolves against the
 * host's own content-area container instead. Clicking it fires `onClick`
 * (typically "close"). Fades in on mount. */
export function Blanket({ onClick, durationMs = 220 }: BlanketProps) {
  const palette = useAppStore((s) => s.palette);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        inset: 0,
        background: scrimColor(palette),
        opacity: visible ? 1 : 0,
        transition: `opacity ${durationMs}ms ease`,
        zIndex: 10,
      }}
    />
  );
}
