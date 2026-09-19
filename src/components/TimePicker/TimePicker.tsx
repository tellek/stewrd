import type { TimePickerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { controlBase, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.TimePicker. Wraps a native
 * time input, styled from the palette. `value`/`onChange` use "HH:MM" (24h). */
export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...controlBase(palette),
        padding: "6px 10px",
        ...(disabled ? disabledStyle() : {}),
      }}
    />
  );
}
