import { useState } from "react";
import type { CalendarProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Plugin-facing primitive, exposed via api.ui.Calendar. Month-grid date
 * picker; `value`/`onChange` use ISO "YYYY-MM-DD" date strings so callers
 * don't need to juggle Date objects across the plugin boundary. */
export function Calendar({ value, onChange }: CalendarProps) {
  const palette = useAppStore((s) => s.palette);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const [viewDate, setViewDate] = useState(selected ?? new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toIso(new Date());

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div style={{ color: palette.text, width: 240 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          style={{ background: "none", border: "none", color: palette.text, cursor: "pointer", fontSize: 14 }}
        >
          {"<"}
        </button>
        <strong>{viewDate.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          style={{ background: "none", border: "none", color: palette.text, cursor: "pointer", fontSize: 14 }}
        >
          {">"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ color: palette.textMuted, fontSize: 12 }}>
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = toIso(new Date(year, month, day));
          const isSelected = iso === value;
          const isToday = iso === today;
          return (
            <div
              key={i}
              onClick={() => onChange(iso)}
              style={{
                padding: 4,
                borderRadius: 4,
                cursor: "pointer",
                background: isSelected ? palette.accent : "transparent",
                color: isSelected ? palette.background : palette.text,
                border: isToday && !isSelected ? `1px solid ${palette.accent}` : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = palette.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = "transparent";
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
