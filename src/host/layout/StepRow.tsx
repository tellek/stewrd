import { useAppStore } from "../state/appStore";

export type StepStatus = "pending" | "running" | "done" | "error";

/** One line of a wizard checklist (Create New Plugin, Publish): a status glyph
 * colored from the palette's status set, a label and an optional detail. */
export function StepRow({ status, label, detail }: { status: StepStatus; label: string; detail?: string }) {
  const palette = useAppStore((s) => s.palette);
  const glyph = { pending: "○", running: "…", done: "✓", error: "✕" }[status];
  const color = {
    pending: palette.textMuted,
    running: palette.status["in-progress"],
    done: palette.status.success,
    error: palette.status.error,
  }[status];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
      <span aria-hidden style={{ color, width: 16, textAlign: "center", fontWeight: 600 }}>
        {glyph}
      </span>
      <div>
        <div style={{ color: status === "pending" ? palette.textMuted : palette.text }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: status === "error" ? palette.status.error : palette.textMuted }}>{detail}</div>}
      </div>
    </div>
  );
}
