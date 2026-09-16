import type { StatusColor } from "../../shared/palette";
import { defaultPalette } from "../../shared/palette";

export function StatusIcon({ status, tooltip }: { status: StatusColor; tooltip?: string }) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: defaultPalette.status[status],
        flexShrink: 0,
      }}
    />
  );
}
