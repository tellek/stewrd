import type { TimePickerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { controlBase, disabledStyle, isLight } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.TimePicker. Wraps a native
 * time input, styled from the palette. `value`/`onChange` use "HH:MM" (24h).
 * The dropdown/clock-icon picker itself is OS/browser-drawn and can't be
 * fully re-colored, but `colorScheme` nudges it (and the icon) to a light or
 * dark rendering that matches the active palette instead of always light. */
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
        colorScheme: isLight(palette.surface) ? "light" : "dark",
        ...(disabled ? disabledStyle() : {}),
      }}
    />
  );
}
