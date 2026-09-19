import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

type Side = "left" | "right" | "top" | "bottom";

/** Demonstrates api.ui.Drawer (all four sides, configurable size/speed) and
 * api.ui.InlineDialog. Both render with `position: absolute` against
 * `MainContent.tsx`'s `<main>` (the nearest positioned ancestor) - this demo
 * deliberately does NOT wrap itself in its own `position: relative` div, so
 * the Blanket dims the whole content area instead of just this section. */
export function OverlaysDemo({ api }: { api: PluginApi }) {
  // drawerSide is kept even after closing (not reset to null) so the close
  // transition slides back out the same side it opened from - Drawer also
  // guards against this itself internally, but the demo shouldn't rely on that.
  const [drawerSide, setDrawerSide] = useState<Side>("right");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [size, setSize] = useState(280);
  const [durationMs, setDurationMs] = useState(220);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          Size (px)
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          Speed (ms)
          <input
            type="number"
            value={durationMs}
            onChange={(e) => setDurationMs(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <api.ui.TextButton
          label="Open Drawer (Left)"
          onClick={() => {
            setDrawerSide("left");
            setDrawerOpen(true);
          }}
        />
        <api.ui.TextButton
          label="Open Drawer (Right)"
          onClick={() => {
            setDrawerSide("right");
            setDrawerOpen(true);
          }}
        />
        <api.ui.TextButton
          label="Open Drawer (Top)"
          onClick={() => {
            setDrawerSide("top");
            setDrawerOpen(true);
          }}
        />
        <api.ui.TextButton
          label="Open Drawer (Bottom)"
          onClick={() => {
            setDrawerSide("bottom");
            setDrawerOpen(true);
          }}
        />
        <api.ui.TextButton label="Open Inline Dialog" onClick={() => setDialogOpen(true)} />
      </div>

      <api.ui.Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side={drawerSide}
        size={size}
        durationMs={durationMs}
        title={`Drawer (${drawerSide})`}
      >
        <p>Drawer content goes here.</p>
      </api.ui.Drawer>

      <api.ui.InlineDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        durationMs={durationMs}
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
