import type { StatusColor } from "../../shared/palette";
import { StatusDot } from "../../components/StatusDot/StatusDot";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { useAppStore } from "../state/appStore";
import { getCategoryIcon } from "./categoryIcons";

export function StatusIcon({ status, tooltip }: { status: StatusColor; tooltip?: string }) {
  const palette = useAppStore((s) => s.palette);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const moreIcon = getCategoryIcon(categoryIconFiles, "more");

  if (status === "idle" && moreIcon) {
    return (
      <span title={tooltip}>
        <MaskIcon png={moreIcon.png} alt="idle" size={14} color={palette.textMuted} />
      </span>
    );
  }

  return (
    <span title={tooltip}>
      <StatusDot color={status} />
    </span>
  );
}
