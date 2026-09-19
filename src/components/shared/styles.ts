import type { Palette } from "../../shared/palette";
import type { CSSProperties } from "react";

/** Shared style-object builders so components don't each reinvent the same
 * palette-derived fragments. Not a styling framework - every component still
 * reads `useAppStore((s) => s.palette)` itself and composes these into its
 * own inline `style` object. */

export function controlBase(palette: Palette): CSSProperties {
  return {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: "inherit",
  };
}

export function focusRing(palette: Palette): CSSProperties {
  return { outline: `2px solid ${palette.accent}`, outlineOffset: 1 };
}

export function disabledStyle(): CSSProperties {
  return { opacity: 0.5, cursor: "not-allowed", pointerEvents: "none" };
}

export function hoverBackground(palette: Palette): CSSProperties {
  return { background: palette.surfaceHover };
}

/** Relative luminance (0-1) of a #rrggbb hex color, used to decide whether a
 * light or dark foreground/overlay reads better on a given background. */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const bytes =
    clean.length === 3
      ? clean.split("").map((c) => parseInt(c + c, 16))
      : [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const [r, g, b] = bytes.map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.5;
}

/** Foreground color that stays legible on top of `bgHex`, derived from the
 * palette (never a hardcoded literal): picks palette.text or palette.background
 * as a fallback pair, whichever contrasts more with bgHex. */
export function contrastText(palette: Palette, bgHex: string): string {
  const bgLight = isLight(bgHex);
  const textLight = isLight(palette.text);
  // palette.text already contrasts with the app's own background; if bgHex
  // shares that lightness, palette.text still contrasts. Otherwise fall back
  // to palette.background, which by construction contrasts with palette.text.
  return bgLight === textLight ? palette.background : palette.text;
}

/** Dimming overlay for Blanket/Drawer/InlineDialog/Modal, luminance-aware so
 * it dims (not brightens) on both light and dark palettes. Derived from
 * palette.background rather than a literal black/white. */
export function scrimColor(palette: Palette, alpha = 0.5): string {
  const base = isLight(palette.background) ? "0,0,0" : "0,0,0";
  // Always dim toward black regardless of theme lightness - a white scrim on
  // a light theme still needs to read as "dimmed", which only a dark overlay
  // achieves, so scrim color is fixed dark but its alpha is theme-aware.
  const a = isLight(palette.background) ? Math.min(alpha + 0.15, 0.85) : alpha;
  return `rgba(${base},${a})`;
}
