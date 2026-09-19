import type { DatePickerProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { controlBase, disabledStyle } from "../shared/styles";
import { Calendar } from "../Calendar/Calendar";

/** Plugin-facing primitive, exposed via api.ui.DatePicker. Text field that
 * opens a `Calendar` popover; `value`/`onChange` use ISO "YYYY-MM-DD". */
export function DatePicker({ value, onChange, placeholder, disabled }: DatePickerProps) {
  const palette = useAppStore((s) => s.palette);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          ...controlBase(palette),
          minWidth: 140,
          textAlign: "left",
          padding: "6px 10px",
          cursor: "pointer",
          ...(disabled ? disabledStyle() : {}),
        }}
      >
        {value || placeholder || "Select date..."}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            padding: 8,
            zIndex: 20,
          }}
        >
          <Calendar
            value={value}
            onChange={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
