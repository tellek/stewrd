import type { StatusColor } from "../../shared/palette";
import { StatusDot } from "../../components/StatusDot/StatusDot";

export function StatusIcon({ status, tooltip }: { status: StatusColor; tooltip?: string }) {
  return (
    <span title={tooltip}>
      <StatusDot color={status} />
    </span>
  );
}
