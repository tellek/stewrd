import type { DateTimePickerProps } from "../../shared/plugin-api.d.ts";
import { DatePicker } from "../DatePicker/DatePicker";
import { TimePicker } from "../TimePicker/TimePicker";

/** Plugin-facing primitive, exposed via api.ui.DateTimePicker. Combines
 * `DatePicker` + `TimePicker`; `value` is `{ date, time }` using the same ISO
 * "YYYY-MM-DD" / "HH:MM" formats as its parts. */
export function DateTimePicker({ value, onChange, disabled }: DateTimePickerProps) {
  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <DatePicker value={value.date} onChange={(date) => onChange({ ...value, date })} disabled={disabled} />
      <TimePicker value={value.time} onChange={(time) => onChange({ ...value, time })} disabled={disabled} />
    </div>
  );
}
