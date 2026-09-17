import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

export function StatusBar() {
  const statusLog = useAppStore((s) => s.statusLog);
  const [expanded, setExpanded] = useState(false);
  const latest = statusLog[statusLog.length - 1];

  return (
    <footer
      style={{
        position: "relative",
        borderTop: `1px solid ${defaultPalette.border}`,
        background: defaultPalette.surface,
        color: defaultPalette.textMuted,
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
            background: defaultPalette.surface,
            borderTop: `1px solid ${defaultPalette.border}`,
          }}
        >
          {statusLog.length === 0 && <p>No log entries yet.</p>}
          {statusLog
            .slice()
            .reverse()
            .map((entry) => (
              <p key={entry.id} style={{ color: defaultPalette.status[entry.level], margin: "2px 0" }}>
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
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          border: "none",
          background: "transparent",
          color: latest ? defaultPalette.status[latest.level] : defaultPalette.textMuted,
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
