import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import MarkdownIt from "markdown-it";
import { useAppStore } from "../state/appStore";
import { listReleases, pendingUpdateVersion, type ReleaseInfo } from "../api/updates";

const md = new MarkdownIt({ html: false, linkify: true });

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function SettingsVersion() {
  const palette = useAppStore((s) => s.palette);
  const [installed, setInstalled] = useState<string | null>(null);
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setInstalled)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    pendingUpdateVersion().then(setPending);
    listReleases()
      .then((r) => {
        setReleases(r);
        setError(null);
        setRateLimited(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setRateLimited(message.toLowerCase().includes("rate limited"));
        setError(message);
      });
  }, []);

  const latest = releases?.[0] ?? null;
  const latestVersion = latest?.tag.replace(/^v/, "") ?? null;
  const installedRelease = releases?.find((r) => r.tag.replace(/^v/, "") === installed) ?? null;

  let statusMessage: string | null = null;
  let statusColor = palette.textMuted;
  if (pending && pending !== installed) {
    statusMessage = `Update v${pending} ready — restart to apply.`;
    statusColor = palette.status.success;
  } else if (installed && latestVersion && compareVersions(latestVersion, installed) > 0) {
    statusMessage = `Update v${latestVersion} available.`;
    statusColor = palette.status.warning;
  } else if (installed && latestVersion) {
    statusMessage = "You're on the latest version.";
  }

  return (
    <div>
      {installed && <p style={{ color: palette.textMuted }}>Installed version: {installed}</p>}
      {statusMessage && <p style={{ color: statusColor }}>{statusMessage}</p>}
      {error && (
        <p style={{ color: palette.status.error }}>
          {rateLimited ? "Rate limited by GitHub — try again later." : `Couldn't load release notes: ${error}`}
        </p>
      )}

      {installedRelease && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, color: palette.text, margin: "0 0 4px" }}>{installedRelease.name}</h3>
          {installedRelease.publishedAt && (
            <p style={{ fontSize: 12, color: palette.textMuted, margin: "0 0 8px" }}>
              {new Date(installedRelease.publishedAt).toLocaleDateString()}
            </p>
          )}
          <div
            style={{ fontSize: 13, color: palette.text }}
            dangerouslySetInnerHTML={{ __html: md.render(installedRelease.body || "*No release notes.*") }}
          />
        </div>
      )}
    </div>
  );
}
