import type { ProgressBarProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

/** Plugin-facing primitive, exposed via api.ui.ProgressBar. `value` is 0-100;
 * omit it for an indeterminate bar. */
export function ProgressBar({ value }: ProgressBarProps) {
  const palette = useAppStore((s) => s.palette);
  const indeterminate = value === undefined;
  const pct = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div
      style={{
        width: "100%",
        height: 6,
        borderRadius: 3,
        background: palette.border,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 3,
          background: palette.accent,
          width: indeterminate ? "40%" : `${pct}%`,
          animation: indeterminate ? "stewrd-progress-indeterminate 1.2s ease-in-out infinite" : undefined,
        }}
      >
        <style>
          {"@keyframes stewrd-progress-indeterminate { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }"}
        </style>
      </div>
    </div>
  );
}
