import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.Calendar / DatePicker / TimePicker / DateTimePicker. */
export function CalendarDemo({ api }: { api: PluginApi }) {
  const [date, setDate] = useState("");
  const [pickerDate, setPickerDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [dateTime, setDateTime] = useState({ date: "", time: "12:00" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ marginBottom: 4 }}>Calendar (inline): {date || "none"}</div>
        <api.ui.Calendar value={date} onChange={setDate} />
      </div>
      <label>
        DatePicker: <api.ui.DatePicker value={pickerDate} onChange={setPickerDate} placeholder="Pick a date" />
      </label>
      <label>
        TimePicker: <api.ui.TimePicker value={time} onChange={setTime} />
      </label>
      <label>
        DateTimePicker: <api.ui.DateTimePicker value={dateTime} onChange={setDateTime} />
      </label>
    </div>
  );
}
