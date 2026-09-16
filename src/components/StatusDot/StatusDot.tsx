import type { StatusColor } from "../../shared/palette";
import { defaultPalette } from "../../shared/palette";

/** Plugin-facing primitive, exposed via api.ui.StatusDot - not raw-imported
 * by plugins. See host/layout/StatusIcon.tsx for the host sidebar's own use
 * (which adds a tooltip on top of this same primitive). */
export function StatusDot({ color }: { color: StatusColor }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: defaultPalette.status[color],
        flexShrink: 0,
      }}
    />
  );
}
