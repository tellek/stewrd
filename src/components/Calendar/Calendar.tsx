import { useState } from "react";
import type { CalendarProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { buildMonthGrid, stepMonth, toIso } from "./calendarGrid";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Plugin-facing primitive, exposed via api.ui.Calendar. Month-grid date
 * picker; `value`/`onChange` use ISO "YYYY-MM-DD" date strings so callers
 * don't need to juggle Date objects across the plugin boundary. */
export function Calendar({ value, onChange }: CalendarProps) {
  const palette = useAppStore((s) => s.palette);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const [viewDate, setViewDate] = useState(selected ?? new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = toIso(new Date());

  const cells = buildMonthGrid(year, month);

  return (
    <div style={{ color: palette.text, width: 240 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          onClick={() => {
            const next = stepMonth(year, month, -1);
            setViewDate(new Date(next.year, next.month, 1));
          }}
          style={{ background: "none", border: "none", color: palette.text, cursor: "pointer", fontSize: 14 }}
        >
          {"<"}
        </button>
        <strong>{viewDate.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong>
        <button
          onClick={() => {
            const next = stepMonth(year, month, 1);
            setViewDate(new Date(next.year, next.month, 1));
          }}
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
