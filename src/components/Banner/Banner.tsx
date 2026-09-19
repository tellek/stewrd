import type { BannerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { MaskIcon } from "../MaskIcon/MaskIcon";

/** Plugin-facing primitive, exposed via api.ui.Banner. `tone` is a palette
 * token, not a raw color - keeps banners theme-consistent instead of letting
 * plugins pick arbitrary hex. `icon` (a data URL, see api.fs.readDataUrl) is
 * optional; there's no auto-derived default icon since the palette has no
 * per-tone icon set today. */
export function Banner({ message, tone = "accent", icon, onDismiss }: BannerProps) {
  const palette = useAppStore((s) => s.palette);
  const color = tone === "accent" ? palette.accent : tone === "surface" ? palette.text : palette.status[tone];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        border: `1px solid ${color}`,
        background: palette.surface,
        color: palette.text,
      }}
    >
      {icon && <MaskIcon png={icon} alt="" size={18} color={color} />}
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: palette.textMuted,
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
