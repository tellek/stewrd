import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";
import checkIcon from "../assets/check.png";
import warningIcon from "../assets/warning2.png";
import errorIcon from "../assets/error.png";

type Tone = "accent" | "success" | "warning" | "error";
type Variant = "outline" | "solid";

const TONE_ICON: Partial<Record<Tone, string>> = { success: checkIcon, warning: warningIcon, error: errorIcon };
const TONES: Tone[] = ["accent", "success", "warning", "error"];

/** Demonstrates api.ui.Banner - both `variant`s ("outline": the original
 * look, "solid": tone-filled background), a left-side icon, auto-dismiss
 * with fade - and api.toast.show's richer (titled, fading) content. */
export function MessagingDemo({ api }: { api: PluginApi }) {
  const [dismissed, setDismissed] = useState(false);
  const [topBanner, setTopBanner] = useState<{ tone: Tone; variant: Variant } | null>(null);
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
            tone={topBanner.tone}
            variant={topBanner.variant}
            message={`${topBanner.tone[0].toUpperCase()}${topBanner.tone.slice(1)} (${topBanner.variant}) banner spawned at the top of the tool area.`}
            icon={TONE_ICON[topBanner.tone]}
            autoDismissMs={topBannerMs}
            onDismiss={() => setTopBanner(null)}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Default variant is "outline" - a palette.surface background with a
            tone-colored border/icon/text, the original Banner look. */}
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

        <label style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 8 }}>
          Stay Open (ms)
          <input
            type="number"
            value={topBannerMs}
            onChange={(e) => setTopBannerMs(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TONES.map((tone) => (
            <api.ui.TextButton
              key={`outline-${tone}`}
              label={`Show ${tone[0].toUpperCase()}${tone.slice(1)} Banner (Outline)`}
              onClick={() => setTopBanner({ tone, variant: "outline" })}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TONES.map((tone) => (
            <api.ui.TextButton
              key={`solid-${tone}`}
              label={`Show ${tone[0].toUpperCase()}${tone.slice(1)} Banner (Solid)`}
              onClick={() => setTopBanner({ tone, variant: "solid" })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
