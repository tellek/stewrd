import { useState } from "react";
import type { IconButtonProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { MaskIcon } from "../MaskIcon/MaskIcon";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.IconButton. `icon` is a data
 * URL (see api.fs.readDataUrl) or other MaskIcon-compatible source. */
export function IconButton({ icon, label, onClick, disabled }: IconButtonProps) {
  const palette = useAppStore((s) => s.palette);
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? palette.surfaceHover : "transparent",
        border: `1px solid ${palette.border}`,
        borderRadius: 4,
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...(disabled ? disabledStyle() : {}),
      }}
    >
      <MaskIcon png={icon} alt={label} color={palette.text} size={16} />
    </button>
  );
}
