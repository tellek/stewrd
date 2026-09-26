import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import clearIcon from "../../assets/category-icons/clear.png";

export function StatusBar() {
  const statusLog = useAppStore((s) => s.statusLog);
  const palette = useAppStore((s) => s.palette);
  const clearStatusLog = useAppStore((s) => s.clearStatusLog);
  const [expanded, setExpanded] = useState(false);
  const [clearHovered, setClearHovered] = useState(false);
  const latest = statusLog[statusLog.length - 1];
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  return (
    <footer
      ref={footerRef}
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
            maxHeight: "25vh",
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
      <div style={{ display: "flex", alignItems: "center", height: 32 }}>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            height: "100%",
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
        <button
          onClick={() => clearStatusLog()}
          onMouseEnter={() => setClearHovered(true)}
          onMouseLeave={() => setClearHovered(false)}
          title="Clear Log"
          style={{
            display: "flex",
            flexShrink: 0,
            height: "100%",
            alignItems: "center",
            padding: "0 12px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <MaskIcon
            png={clearIcon}
            alt="Clear Log"
            size={14}
            color={clearHovered ? palette.status.error : palette.textMuted}
          />
        </button>
      </div>
    </footer>
  );
}
