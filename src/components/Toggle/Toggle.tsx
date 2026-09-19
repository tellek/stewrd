import type { ToggleProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Toggle. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
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
          width: 34,
          height: 18,
          borderRadius: 9,
          background: checked ? palette.accent : palette.border,
          position: "relative",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: palette.background,
            transition: "left 0.15s",
          }}
        />
      </span>
      {label}
    </label>
  );
}
