import type { RadioGroupProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.RadioGroup. */
export function RadioGroup({ options, value, onChange, disabled }: RadioGroupProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
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
              onClick={() => !disabled && onChange(opt.value)}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `1px solid ${selected ? palette.accent : palette.border}`,
                background: palette.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected && (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: palette.accent }} />
              )}
            </span>
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
