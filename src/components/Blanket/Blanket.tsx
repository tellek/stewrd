import type { BlanketProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { scrimColor } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Blanket. Dims the content area
 * behind a Drawer/InlineDialog; scoped to the plugin's own container (not the
 * whole app) via `position: absolute` against the nearest positioned
 * ancestor. Clicking it fires `onClick` (typically "close"). */
export function Blanket({ onClick }: BlanketProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        inset: 0,
        background: scrimColor(palette),
        zIndex: 10,
      }}
    />
  );
}
