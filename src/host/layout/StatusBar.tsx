import { useState } from "react";
import { useAppStore } from "../state/appStore";

export function StatusBar() {
  const statusLog = useAppStore((s) => s.statusLog);
  const palette = useAppStore((s) => s.palette);
  const [expanded, setExpanded] = useState(false);
  const latest = statusLog[statusLog.length - 1];

  return (
    <footer
      style={{
        position: "relative",
        borderTop: `1px solid ${palette.border}`,
        background: palette.surface,
        color: palette.textMuted,
        fontSize: 12,
      }}
    >
      {expanded && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            maxHeight: 160,
            overflowY: "auto",
            padding: "8px 12px",
            background: palette.surface,
            borderTop: `1px solid ${palette.border}`,
          }}
        >
          {statusLog.length === 0 && <p>No log entries yet.</p>}
          {statusLog
            .slice()
            .reverse()
            .map((entry) => (
              <p key={entry.id} style={{ color: palette.status[entry.level], margin: "2px 0" }}>
                [{new Date(entry.timestamp).toLocaleTimeString()}]
                {entry.pluginId ? ` (${entry.pluginId})` : ""} {entry.message}
              </p>
            ))}
        </div>
      )}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          width: "100%",
          height: 32,
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          border: "none",
          background: "transparent",
          color: latest ? palette.status[latest.level] : palette.textMuted,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>{latest ? latest.message : "Ready"}</span>
      </button>
    </footer>
  );
}
