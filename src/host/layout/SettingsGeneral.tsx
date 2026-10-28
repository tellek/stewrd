import { useEffect, useState } from "react";
import { getName } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../state/appStore";
import type { TaskbarBadgeThreshold } from "../state/hostSettings";
import { createShellApi } from "../api/shell";

const REPO = "tellek/stewrd";

const BADGE_OPTIONS: { id: TaskbarBadgeThreshold; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "success", label: "Success or worse" },
  { id: "warning", label: "Warning or worse" },
  { id: "error", label: "Error or worse" },
];

export function SettingsGeneral() {
  const palette = useAppStore((s) => s.palette);
  const taskbarBadgeThreshold = useAppStore((s) => s.taskbarBadgeThreshold);
  const setTaskbarBadgeThreshold = useAppStore((s) => s.setTaskbarBadgeThreshold);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starState, setStarState] = useState<"idle" | "starring" | "starred" | "error">("idle");
  const [starError, setStarError] = useState("");

  useEffect(() => {
    getName()
      .then(setName)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const star = async () => {
    setStarState("starring");
    try {
      const res = await createShellApi().exec("gh", ["api", "-X", "PUT", `user/starred/${REPO}`]);
      if (res.code !== 0) throw new Error(res.stderr.trim() || `gh exited with ${res.code}`);
      setStarState("starred");
    } catch (err) {
      setStarError(err instanceof Error ? err.message : String(err));
      setStarState("error");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: palette.textMuted }}>Enjoying Stewrd? Consider starring it on GitHub.</span>
        <button
          onClick={star}
          disabled={starState === "starring" || starState === "starred"}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border: `1px solid ${palette.border}`,
            background: palette.surface,
            color: palette.text,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {starState === "starred" ? "★ Starred" : "★ Star"}
        </button>
        <a
          href={`https://github.com/${REPO}`}
          onClick={(e) => {
            e.preventDefault();
            openUrl(`https://github.com/${REPO}`).catch(() => {});
          }}
          style={{ fontSize: 12, color: palette.accent }}
        >
          View on GitHub
        </a>
        {starState === "error" && (
          <span style={{ fontSize: 12, color: palette.status.error }}>
            Couldn't star (needs the GitHub CLI signed in): {starError}
          </span>
        )}
      </div>

      {name && <p style={{ color: palette.textMuted }}>{name}</p>}
      {error && <p style={{ color: palette.status.error }}>Couldn't read app info: {error}</p>}

      <h3 style={{ fontSize: 13, color: palette.text }}>Taskbar status badge</h3>
      <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
        Show a badge on the taskbar icon when a tool's status reaches this level or worse.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {BADGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTaskbarBadgeThreshold(opt.id)}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: `1px solid ${taskbarBadgeThreshold === opt.id ? palette.accent : palette.border}`,
              background: taskbarBadgeThreshold === opt.id ? palette.surfaceHover : palette.surface,
              color: palette.text,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
