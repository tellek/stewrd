import type { StatusColor } from "../../shared/palette";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { useAppStore } from "../state/appStore";
import { getCategoryIcon } from "./categoryIcons";

/** Tints an icon by status instead of showing a separate dot: idle uses the
 * icon's normal tint, any other status recolors the whole icon. Falls back
 * to the "more" category icon when the plugin has none of its own. */
export function StatusIcon({
  status,
  tooltip,
  png,
  alt,
  size = 24,
  idleColor,
}: {
  status: StatusColor;
  tooltip?: string;
  png?: string;
  alt: string;
  size?: number;
  idleColor?: string;
}) {
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const defaultIcon = getCategoryIcon(categoryIconFiles, "more");
  const iconPng = png ?? defaultIcon?.png;
  const color = status === "idle" ? (idleColor ?? palette.textMuted) : palette.status[status];

  return (
    <span title={tooltip}>
      <MaskIcon png={iconPng} alt={alt} size={size} color={color} />
    </span>
  );
}
