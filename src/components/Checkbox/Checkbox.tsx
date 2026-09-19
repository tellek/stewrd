import type { CheckboxProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Checkbox. */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: palette.text,
        cursor: "pointer",
        ...(disabled ? disabledStyle() : {}),
      }}
    >
      <span
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          border: `1px solid ${checked ? palette.accent : palette.border}`,
          background: checked ? palette.accent : palette.surface,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && (
          <svg width={10} height={10} viewBox="0 0 10 10">
            <path d="M1 5l3 3 5-6" stroke={palette.background} strokeWidth={1.5} fill="none" />
          </svg>
        )}
      </span>
      {label}
    </label>
  );
}
