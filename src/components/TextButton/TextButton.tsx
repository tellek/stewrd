import { useState } from "react";
import type { TextButtonProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { contrastText, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.TextButton. */
export function TextButton({ label, onClick, variant = "secondary", disabled }: TextButtonProps) {
  const palette = useAppStore((s) => s.palette);
  const [hover, setHover] = useState(false);

  const background = variant === "primary" ? palette.accent : hover ? palette.surfaceHover : palette.surface;
  const color = variant === "primary" ? contrastText(palette, palette.accent) : palette.text;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background,
        color,
        border: `1px solid ${variant === "primary" ? palette.accent : palette.border}`,
        borderRadius: 4,
        padding: "6px 14px",
        fontFamily: "inherit",
        fontSize: "inherit",
        cursor: "pointer",
        ...(disabled ? disabledStyle() : {}),
      }}
    >
      {label}
    </button>
  );
}
