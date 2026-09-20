import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import { useAppStore } from "../state/appStore";
import { listReleases, type ReleaseInfo } from "../api/updates";

const md = new MarkdownIt({ html: false, linkify: true });

export function SettingsReleaseNotes() {
  const palette = useAppStore((s) => s.palette);
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
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

  return (
    <div>
      {error && (
        <p style={{ color: palette.status.error }}>
          {rateLimited ? "Rate limited by GitHub — try again later." : `Couldn't load release notes: ${error}`}
        </p>
      )}
      {!releases && !error && <p style={{ color: palette.textMuted }}>Loading…</p>}
      {releases?.map((release) => (
        <div key={release.tag} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${palette.border}` }}>
          <h3 style={{ fontSize: 14, color: palette.text, margin: "0 0 4px" }}>{release.name}</h3>
          {release.publishedAt && (
            <p style={{ fontSize: 12, color: palette.textMuted, margin: "0 0 8px" }}>
              {new Date(release.publishedAt).toLocaleDateString()}
            </p>
          )}
          <div
            style={{ fontSize: 13, color: palette.text }}
            dangerouslySetInnerHTML={{ __html: md.render(release.body || "*No release notes.*") }}
          />
        </div>
      ))}
    </div>
  );
}
