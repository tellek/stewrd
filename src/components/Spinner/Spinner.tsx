import type { SpinnerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

/** Plugin-facing primitive, exposed via api.ui.Spinner. */
export function Spinner({ size = 20 }: SpinnerProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${palette.border}`,
        borderTopColor: palette.accent,
        animation: "stewrd-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes stewrd-spin { to { transform: rotate(360deg); } }"}</style>
    </span>
  );
}
