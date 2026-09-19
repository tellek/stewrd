import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";
import checkIcon from "../assets/check.png";
import warningIcon from "../assets/warning2.png";
import errorIcon from "../assets/error.png";

type Tone = "success" | "warning" | "error";

const TONE_ICON: Record<Tone, string> = { success: checkIcon, warning: warningIcon, error: errorIcon };

/** Demonstrates api.ui.Banner (solid tone colors, left-side icon, auto-dismiss
 * with fade) and api.toast.show's richer (titled, fading) content. */
export function MessagingDemo({ api }: { api: PluginApi }) {
  const [dismissed, setDismissed] = useState(false);
  const [topBanner, setTopBanner] = useState<Tone | null>(null);
  const [topBannerMs, setTopBannerMs] = useState(3000);

  return (
    <div>
      {/* No `position: relative` wrapper here on purpose - the spawned banner
          below resolves its `position: absolute` against MainContent.tsx's
          `<main>` instead, so it spans the full tool/content area rather than
          just this demo section. */}
      {topBanner && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 15 }}>
          <api.ui.Banner
            tone={topBanner}
            message={`${topBanner[0].toUpperCase()}${topBanner.slice(1)} banner spawned at the top of the tool area.`}
            icon={TONE_ICON[topBanner]}
            autoDismissMs={topBannerMs}
            onDismiss={() => setTopBanner(null)}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <api.ui.Banner tone="accent" message="Informational banner (default accent tone)." />
        <api.ui.Banner tone="success" message="Success tone banner." icon={checkIcon} />
        <api.ui.Banner tone="error" message="Error tone banner." icon={errorIcon} />
        {!dismissed && (
          <api.ui.Banner
            tone="warning"
            message="Dismissible banner."
            icon={warningIcon}
            onDismiss={() => setDismissed(true)}
          />
        )}

        <api.ui.TextButton
          label="Show Titled Toast"
          onClick={() => api.toast.show({ title: "Saved", message: "Your changes were saved.", kind: "success" })}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Stay Open (ms)
            <input
              type="number"
              value={topBannerMs}
              onChange={(e) => setTopBannerMs(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
          <api.ui.TextButton label="Show Success Banner" onClick={() => setTopBanner("success")} />
          <api.ui.TextButton label="Show Warning Banner" onClick={() => setTopBanner("warning")} />
          <api.ui.TextButton label="Show Error Banner" onClick={() => setTopBanner("error")} />
        </div>
      </div>
    </div>
  );
}
