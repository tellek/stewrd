import type { PluginApi } from "stewrd-plugin-api";
// Bundled plugin assets: esbuild's dataurl loader inlines these as base64
// data URL strings at build time (see scripts/stewrd-plugin-build.mjs) - this
// is the pattern to follow for any icon shipped with your own plugin. For an
// icon a *user* supplies at runtime instead, use api.fs.readDataUrl(path).
import ideaIcon from "../assets/idea.png";
import settingsIcon from "../assets/settings.png";

/** Demonstrates api.ui.TextButton / IconButton / IconTextButton. */
export function ButtonsDemo({ api }: { api: PluginApi }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <api.ui.TextButton label="Secondary" onClick={() => api.log.info("secondary clicked")} />
      <api.ui.TextButton label="Primary" variant="primary" onClick={() => api.log.info("primary clicked")} />
      <api.ui.TextButton label="Disabled" disabled onClick={() => {}} />
      <api.ui.IconButton label="Idea" icon={ideaIcon} onClick={() => api.log.info("icon button clicked")} />
      <api.ui.IconTextButton
        label="Settings"
        icon={settingsIcon}
        onClick={() => api.log.info("icon+text button clicked")}
      />
    </div>
  );
}
