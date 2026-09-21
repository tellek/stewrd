/** ISO "YYYY-MM-DD" for a Date, used so Calendar's value/onChange stay plain
 * strings across the plugin boundary rather than juggling Date objects. */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The month grid for `month` (0-indexed) of `year`: `null` for the leading
 * blank cells before the 1st (aligned to Sunday), then 1..daysInMonth. */
export function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
}

/** Advances (year, month) by `delta` months, rolling over the year boundary
 * (relies on JS Date's own month-index normalization). */
export function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
