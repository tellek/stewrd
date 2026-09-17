import type { TextBoxProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

/** Plugin-facing primitive, exposed via api.ui.TextBox. */
export function TextBox({ value, onChange, placeholder, readOnly, rows = 10 }: TextBoxProps) {
  const palette = useAppStore((s) => s.palette);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={rows}
      style={{
        width: "100%",
        resize: "vertical",
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: 4,
        padding: 8,
        fontFamily: "inherit",
        fontSize: "inherit",
      }}
    />
  );
}
