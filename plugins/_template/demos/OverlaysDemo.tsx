import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.Drawer / InlineDialog. Both position themselves
 * against the nearest positioned ancestor, which this wrapper `div` provides
 * so the overlay stays scoped to this demo instead of covering the sidebar. */
export function OverlaysDemo({ api }: { api: PluginApi }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div style={{ position: "relative", minHeight: 160 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <api.ui.TextButton label="Open Drawer" onClick={() => setDrawerOpen(true)} />
        <api.ui.TextButton label="Open Inline Dialog" onClick={() => setDialogOpen(true)} />
      </div>

      <api.ui.Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drawer Title">
        <p>Drawer content goes here.</p>
      </api.ui.Drawer>

      <api.ui.InlineDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Confirm Action"
        message="Are you sure you want to do this?"
      >
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <api.ui.TextButton label="Cancel" onClick={() => setDialogOpen(false)} />
          <api.ui.TextButton
            label="Confirm"
            variant="primary"
            onClick={() => {
              api.log.info("confirmed");
              setDialogOpen(false);
            }}
          />
        </div>
      </api.ui.InlineDialog>
    </div>
  );
}
