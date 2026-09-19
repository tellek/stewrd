import { useEffect, useState } from "react";
import type { BannerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { MaskIcon } from "../MaskIcon/MaskIcon";
import { contrastText } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Banner. Solid-colored, `tone`
 * is a palette token (not a raw color) that controls both the background and
 * - via `contrastText` - a legible text/icon/dismiss color on top of it;
 * that's the "controllable color" here, not an arbitrary hex prop. `icon`
 * (a data URL, see api.fs.readDataUrl) is optional; there's no auto-derived
 * default icon since the palette has no per-tone icon set today. If
 * `autoDismissMs` is set, the banner fades itself out (1s) then calls
 * `onDismiss` - the caller is still the one that actually removes it from
 * its own render tree. */
export function Banner({ message, tone = "accent", icon, onDismiss, autoDismissMs }: BannerProps) {
  const palette = useAppStore((s) => s.palette);
  const [visible, setVisible] = useState(true);
  const background = tone === "accent" ? palette.accent : tone === "surface" ? palette.surface : palette.status[tone];
  const textColor = contrastText(palette, background);

  useEffect(() => {
    if (!autoDismissMs) return;
    const timer = setTimeout(() => setVisible(false), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs]);

  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => onDismiss?.(), 1000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        background,
        color: textColor,
        opacity: visible ? 1 : 0,
        transition: "opacity 1000ms ease",
      }}
    >
      {icon && <MaskIcon png={icon} alt="" size={18} color={textColor} />}
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          title="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: textColor,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
