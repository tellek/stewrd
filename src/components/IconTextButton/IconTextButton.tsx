import { useState } from "react";
import type { IconTextButtonProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { MaskIcon } from "../MaskIcon/MaskIcon";
import { contrastText, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.IconTextButton. `icon` is a
 * data URL (see api.fs.readDataUrl) or other MaskIcon-compatible source. */
export function IconTextButton({ icon, label, onClick, variant = "secondary", disabled }: IconTextButtonProps) {
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
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "inherit",
        fontSize: "inherit",
        cursor: "pointer",
        ...(disabled ? disabledStyle() : {}),
      }}
    >
      <MaskIcon png={icon} alt="" color={color} size={14} />
      {label}
    </button>
  );
}
