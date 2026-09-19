import { useEffect, useState } from "react";
import type { BannerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { MaskIcon } from "../MaskIcon/MaskIcon";
import { contrastText } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Banner. `tone` is a palette
 * token (not a raw color) that drives the banner's color; `variant` picks how
 * that color is applied: `"outline"` (default) keeps the original look - a
 * `palette.surface` background with a `tone`-colored border/icon/text -
 * while `"solid"` fills the background with the tone color and picks a
 * legible foreground via `contrastText`. `icon` (a data URL, see
 * api.fs.readDataUrl) is optional; there's no auto-derived default icon since
 * the palette has no per-tone icon set today. If `autoDismissMs` is set, the
 * banner fades itself out (1s) then calls `onDismiss` - the caller is still
 * the one that actually removes it from its own render tree. */
export function Banner({ message, tone = "accent", variant = "outline", icon, onDismiss, autoDismissMs }: BannerProps) {
  const palette = useAppStore((s) => s.palette);
  const [visible, setVisible] = useState(true);
  const toneColor = tone === "accent" ? palette.accent : tone === "surface" ? palette.text : palette.status[tone];

  const background = variant === "solid" ? (tone === "surface" ? palette.surface : toneColor) : palette.surface;
  const textColor = variant === "solid" ? contrastText(palette, background) : palette.text;
  const iconColor = variant === "solid" ? textColor : toneColor;

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
        border: variant === "outline" ? `1px solid ${toneColor}` : undefined,
        background,
        color: textColor,
        opacity: visible ? 1 : 0,
        transition: "opacity 1000ms ease",
      }}
    >
      {icon && <MaskIcon png={icon} alt="" size={18} color={iconColor} />}
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
