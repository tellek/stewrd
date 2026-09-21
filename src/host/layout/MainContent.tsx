import { useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { PluginErrorBoundary } from "../errors/PluginErrorBoundary";
import type { PluginRegistryEntry } from "../loader/usePluginRegistry";
import type { PaneEdge, PaneNode } from "../state/paneTree";
import { countLeaves, findLeafForPlugin } from "../state/paneTree";
import { SettingsPage } from "./SettingsPage";
import type { Palette } from "../../shared/palette";

// Minimum size (percent) either side of a split may shrink to - stops a
// divider drag from collapsing a pane to unusable size.
const MIN_PANE_PERCENT = 15;

/** Pure edge-detection math: given a point (already relative to `rect`'s
 * origin, in client coordinates) and the drop target's bounding rect, which
 * of the 4 edges (or center) the point falls in, using a 20% margin band on
 * each side. */
export function detectEdgeAt(clientX: number, clientY: number, rect: DOMRect): PaneEdge | "center" {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const margin = 0.2;
  if (x < margin) return "left";
  if (x > 1 - margin) return "right";
  if (y < margin) return "top";
  if (y > 1 - margin) return "bottom";
  return "center";
}

function detectEdge(e: React.DragEvent, rect: DOMRect): PaneEdge | "center" {
  return detectEdgeAt(e.clientX, e.clientY, rect);
}

/** Pure clamp for a divider drag position (percent, 0-100) so neither side of
 * a split can shrink below MIN_PANE_PERCENT. */
export function clampPanePercent(pct: number): number {
  return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, pct));
}

function zoneOverlayStyle(zone: PaneEdge | "center", palette: Palette): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    background: palette.accent,
    opacity: 0.25,
    pointerEvents: "none",
  };
  switch (zone) {
    case "left":
      return { ...base, left: 0, top: 0, bottom: 0, width: "25%" };
    case "right":
      return { ...base, right: 0, top: 0, bottom: 0, width: "25%" };
    case "top":
      return { ...base, left: 0, right: 0, top: 0, height: "25%" };
    case "bottom":
      return { ...base, left: 0, right: 0, bottom: 0, height: "25%" };
    case "center":
      return { ...base, inset: 0 };
  }
}

function PaneLeafView({
  node,
  entries,
  onReload,
}: {
  node: Extract<PaneNode, { type: "leaf" }>;
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
  const palette = useAppStore((s) => s.palette);
  const activePaneId = useAppStore((s) => s.activePaneId);
  const paneTree = useAppStore((s) => s.paneTree);
  const draggingPluginId = useAppStore((s) => s.draggingPluginId);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const setPaneTool = useAppStore((s) => s.setPaneTool);
  const splitPane = useAppStore((s) => s.splitPane);
  const closePane = useAppStore((s) => s.closePane);
  const [dropZone, setDropZone] = useState<PaneEdge | "center" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = node.pluginId ? entries.find((e) => e.manifest.id === node.pluginId) : undefined;
  const isActivePane = node.id === activePaneId;
  const canClose = countLeaves(paneTree) > 1;
  // A plugin already open elsewhere can only ever move focus there (v1
  // restricts a plugin to one pane) - reject the drop here so dragging it
  // over another pane doesn't show a split/replace preview that then
  // silently does nothing.
  const draggedElsewhere =
    draggingPluginId != null && findLeafForPlugin(paneTree, draggingPluginId)?.id !== node.id
      ? findLeafForPlugin(paneTree, draggingPluginId) != null
      : false;

  return (
    <div
      ref={containerRef}
      onClick={() => setActivePane(node.id)}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedElsewhere) {
          e.dataTransfer.dropEffect = "none";
          setDropZone(null);
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setDropZone(detectEdge(e, rect));
      }}
      onDragLeave={() => setDropZone(null)}
      onDrop={(e) => {
        e.preventDefault();
        const pluginId = e.dataTransfer.getData("text/plain");
        const zone = dropZone;
        setDropZone(null);
        if (!pluginId || !zone) return;
        if (zone === "center") setPaneTool(node.id, pluginId);
        else splitPane(node.id, zone, pluginId);
      }}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        padding: 16,
        outline: isActivePane ? `2px solid ${palette.accent}` : "none",
        outlineOffset: -2,
      }}
    >
      {canClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            closePane(node.id);
          }}
          title="Close pane"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 1,
            border: "none",
            background: "transparent",
            color: palette.textMuted,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>
      )}
      {!node.pluginId && <p style={{ color: palette.textMuted }}>Drag a tool here, or select one from the sidebar.</p>}
      {node.pluginId && !active && (
        <p style={{ color: palette.textMuted }}>Plugin no longer installed.</p>
      )}
      {node.pluginId && active && !active.loaded && !active.loadError && (
        <p style={{ color: palette.textMuted }}>Loading "{active.manifest.name}"...</p>
      )}
      {node.pluginId &&
        active &&
        (active.loadError ? (
          <p style={{ color: palette.status.error }}>
            Plugin "{active.manifest.id}" failed to load/activate: {active.loadError}
          </p>
        ) : active.loaded && active.api ? (
          <PluginErrorBoundary
            key={`${node.id}:${active.manifest.id}:${active.generation}`}
            pluginId={active.manifest.id}
            onReload={() => onReload(active.manifest.id)}
          >
            <active.Component api={active.api} />
          </PluginErrorBoundary>
        ) : null)}
      {dropZone && <div style={zoneOverlayStyle(dropZone, palette)} />}
    </div>
  );
}

function PaneSplitView({
  node,
  entries,
  onReload,
}: {
  node: Extract<PaneNode, { type: "split" }>;
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
  const palette = useAppStore((s) => s.palette);
  const resizePane = useAppStore((s) => s.resizePane);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  function onDividerPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    draggingRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    document.body.style.cursor = node.direction === "row" ? "col-resize" : "row-resize";

    function onMove(ev: PointerEvent) {
      if (!draggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const pct =
        node.direction === "row"
          ? ((ev.clientX - rect.left) / rect.width) * 100
          : ((ev.clientY - rect.top) / rect.height) * 100;
      const clamped = clampPanePercent(pct);
      resizePane(node.id, [clamped, 100 - clamped]);
    }
    function onUp() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const [a, b] = node.children;
  const [sizeA, sizeB] = node.sizes;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: node.direction === "row" ? "row" : "column",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", flexBasis: `${sizeA}%`, minWidth: 0, minHeight: 0 }}>
        <PaneView node={a} entries={entries} onReload={onReload} />
      </div>
      <div
        onPointerDown={onDividerPointerDown}
        style={{
          flexShrink: 0,
          background: palette.border,
          cursor: node.direction === "row" ? "col-resize" : "row-resize",
          // Sits above both panes: the negative margins make the hit-box
          // overlap the siblings, and the later sibling would otherwise win
          // hit-testing over it.
          position: "relative",
          zIndex: 1,
          touchAction: "none",
          // Sizes are border-box (see App.css), so the outer size must include
          // the padding: 7 - 3 - 3 leaves the 1px visible line (backgroundClip
          // keeps the background off the padding), and the negative margins
          // pull the 7px hit-box back down to 1px of layout space.
          ...(node.direction === "row"
            ? {
                width: 7,
                marginLeft: -3,
                marginRight: -3,
                paddingLeft: 3,
                paddingRight: 3,
                backgroundClip: "content-box",
              }
            : {
                height: 7,
                marginTop: -3,
                marginBottom: -3,
                paddingTop: 3,
                paddingBottom: 3,
                backgroundClip: "content-box",
              }),
        }}
      />
      <div style={{ display: "flex", flexBasis: `${sizeB}%`, minWidth: 0, minHeight: 0 }}>
        <PaneView node={b} entries={entries} onReload={onReload} />
      </div>
    </div>
  );
}

function PaneView({
  node,
  entries,
  onReload,
}: {
  node: PaneNode;
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
  return node.type === "leaf" ? (
    <PaneLeafView node={node} entries={entries} onReload={onReload} />
  ) : (
    <PaneSplitView node={node} entries={entries} onReload={onReload} />
  );
}

export function MainContent({
  entries,
  onReload,
}: {
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
  const view = useAppStore((s) => s.view);
  const paneTree = useAppStore((s) => s.paneTree);
  const palette = useAppStore((s) => s.palette);

  return (
    <main
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        display: "flex",
        background: palette.background,
        color: palette.text,
      }}
    >
      {view === "settings" ? (
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <SettingsPage />
        </div>
      ) : (
        <PaneView node={paneTree} entries={entries} onReload={onReload} />
      )}
    </main>
  );
}
