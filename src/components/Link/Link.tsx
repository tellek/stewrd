import { useState } from "react";
import type { LinkProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Link. A styled clickable
 * label (not a raw browser <a>, since plugins have no page navigation). */
export function Link({ label, onClick, disabled }: LinkProps) {
  const palette = useAppStore((s) => s.palette);
  const [hover, setHover] = useState(false);

  return (
    <span
      onClick={() => !disabled && onClick()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: palette.accent,
        textDecoration: hover && !disabled ? "underline" : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        ...(disabled ? disabledStyle() : {}),
      }}
    >
      {label}
    </span>
  );
}
