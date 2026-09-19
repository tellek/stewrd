import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.Spinner / ProgressBar / Skeleton. */
export function LoadingDemo({ api }: { api: PluginApi }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 300 }}>
      <api.ui.Spinner size={24} />
      <api.ui.ProgressBar value={60} />
      <api.ui.ProgressBar />
      <api.ui.Skeleton height={16} />
      <api.ui.Skeleton width={120} height={16} />
    </div>
  );
}
