import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Palette, StatusColor } from "../shared/palette";
import type { TaskbarBadgeThreshold } from "./state/hostSettings";

// Which worst-statuses should trigger the badge for a given threshold.
// "off" has no entry - it never shows a badge.
export const THRESHOLD_LEVELS: Record<Exclude<TaskbarBadgeThreshold, "off">, StatusColor[]> = {
  error: ["error"],
  warning: ["error", "warning"],
  success: ["error", "warning", "in-progress", "success"],
};

export function shouldShowBadge(worst: StatusColor, threshold: TaskbarBadgeThreshold): boolean {
  if (threshold === "off") return false;
  return THRESHOLD_LEVELS[threshold].includes(worst);
}

const BADGE_SIZE = 32;

/** Draws a small filled circle in the given color onto an off-screen canvas
 * and returns it as PNG bytes, so the badge stays palette-driven instead of
 * a static asset. */
export async function renderBadgeIcon(color: string, borderColor: string): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = BADGE_SIZE;
  canvas.height = BADGE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const center = BADGE_SIZE / 2;
  const radius = BADGE_SIZE / 2 - 2;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Computes the overlay icon bytes for the given status/threshold/palette,
 * or `undefined` if no badge should show. Split out from `applyOverlayIcon`
 * so callers can check for staleness (e.g. a newer status change superseding
 * this one) after the async canvas work but before touching the real
 * taskbar icon. */
export async function computeBadgeIcon(
  worst: StatusColor,
  threshold: TaskbarBadgeThreshold,
  palette: Palette,
): Promise<Uint8Array | undefined> {
  if (!shouldShowBadge(worst, threshold)) return undefined;
  return renderBadgeIcon(palette.status[worst], palette.background);
}

export async function applyOverlayIcon(bytes: Uint8Array | undefined): Promise<void> {
  try {
    await getCurrentWindow().setOverlayIcon(bytes);
  } catch (err) {
    // Expected to reject on non-Windows platforms (setOverlayIcon is
    // Windows-only), but also logged so a real misconfiguration (e.g. a
    // missing ACL permission) is visible in dev tools rather than silently
    // swallowed.
    console.error("[taskbarBadge] failed to update overlay icon", err);
  }
}
