import type { RangeSliderProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.RangeSlider. Wraps a native
 * range input, styled from the palette via the accent-colored track/thumb. */
export function RangeSlider({ value, onChange, min = 0, max = 100, step = 1, disabled }: RangeSliderProps) {
  const palette = useAppStore((s) => s.palette);
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: "100%",
        accentColor: palette.accent,
        background: `linear-gradient(to right, ${palette.accent} ${pct}%, ${palette.border} ${pct}%)`,
        ...(disabled ? disabledStyle() : {}),
      }}
    />
  );
}
