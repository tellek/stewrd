import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.Banner and api.toast.show's richer (titled) content. */
export function MessagingDemo({ api }: { api: PluginApi }) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <api.ui.Banner message="Informational banner (default accent tone)." />
      <api.ui.Banner tone="success" message="Success tone banner." />
      <api.ui.Banner tone="error" message="Error tone banner." />
      {!dismissed && (
        <api.ui.Banner tone="warning" message="Dismissible banner." onDismiss={() => setDismissed(true)} />
      )}
      <api.ui.TextButton
        label="Show Titled Toast"
        onClick={() => api.toast.show({ title: "Saved", message: "Your changes were saved.", kind: "success" })}
      />
    </div>
  );
}
