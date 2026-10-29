/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";

const NAME = "__PLUGIN_NAME__";

export function activate(ctx: PluginContext) {
  ctx.api.statusIcon.set("idle");
  ctx.api.log.info(`${NAME} activated`);
}

export function Component({ api }: { api: PluginApi }) {
  const { TextButton } = api.ui;
  const [clicks, setClicks] = useState(0);
  const palette = api.theme.palette;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, color: palette.text }}>
      <h2 style={{ margin: 0 }}>Hello From {NAME}</h2>
      <p style={{ margin: 0, color: palette.textMuted }}>
        Edit index.tsx, then run the build to see your changes. Clicked {clicks} times.
      </p>
      <div>
        <TextButton label="Say Hello" variant="primary" onClick={() => setClicks((c) => c + 1)} />
      </div>
    </div>
  );
}
