/** Binary split-tree describing how the main area is divided into panes.
 * Pure, JSON-serializable (no functions) so it can be persisted as a
 * SavedLayout via hostSettings. See appStore.ts for the state that wraps
 * this and MainContent.tsx for the recursive renderer. */

export type PaneEdge = "left" | "right" | "top" | "bottom";

export interface PaneLeaf {
  type: "leaf";
  id: string;
  pluginId: string | null;
  /** This pane's own zoom factor. Missing = follow the plugin's last-used
   * zoom (appStore's pluginZoom). Cleared when the pane's plugin changes. */
  zoom?: number;
}

export interface PaneSplit {
  type: "split";
  id: string;
  direction: "row" | "column";
  children: [PaneNode, PaneNode];
  sizes: [number, number];
}

export type PaneNode = PaneLeaf | PaneSplit;

export function createLeaf(pluginId: string | null = null): PaneLeaf {
  return { type: "leaf", id: crypto.randomUUID(), pluginId };
}

/** All plugin ids currently occupying a pane, left-to-right/top-to-bottom,
 * excluding empty leaves. */
export function collectPaneToolIds(node: PaneNode): string[] {
  if (node.type === "leaf") return node.pluginId ? [node.pluginId] : [];
  return [...collectPaneToolIds(node.children[0]), ...collectPaneToolIds(node.children[1])];
}

export function countLeaves(node: PaneNode): number {
  return node.type === "leaf" ? 1 : countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

export function findLeafForPlugin(node: PaneNode, pluginId: string): PaneLeaf | null {
  if (node.type === "leaf") return node.pluginId === pluginId ? node : null;
  return findLeafForPlugin(node.children[0], pluginId) ?? findLeafForPlugin(node.children[1], pluginId);
}

export function findLeaf(node: PaneNode, id: string): PaneLeaf | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

/** First leaf id in a subtree, used to re-focus after the active pane closes
 * or after applying a layout. */
export function firstLeafId(node: PaneNode): string {
  return node.type === "leaf" ? node.id : firstLeafId(node.children[0]);
}

export function setPluginInTree(node: PaneNode, paneId: string, pluginId: string | null): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== paneId) return node;
    // A different plugin must not inherit the previous plugin's zoom.
    return node.pluginId === pluginId ? node : { ...node, pluginId, zoom: undefined };
  }
  const children: [PaneNode, PaneNode] = [
    setPluginInTree(node.children[0], paneId, pluginId),
    setPluginInTree(node.children[1], paneId, pluginId),
  ];
  return children[0] === node.children[0] && children[1] === node.children[1] ? node : { ...node, children };
}

/** Splits leaf `paneId` in the given edge direction, putting `newLeaf` on
 * that side. left/right => side-by-side ("row", vertical divider); top/bottom
 * => stacked ("column", horizontal divider). Caller creates `newLeaf` (e.g.
 * via createLeaf) so it can reliably focus its id afterwards - a lookup by
 * plugin id after the fact would pick the tree-order-first leaf instead,
 * which is wrong when the plugin already occupies another pane. */
export function splitLeafInTree(node: PaneNode, paneId: string, edge: PaneEdge, newLeaf: PaneLeaf): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== paneId) return node;
    const direction: "row" | "column" = edge === "left" || edge === "right" ? "row" : "column";
    const children: [PaneNode, PaneNode] = edge === "left" || edge === "top" ? [newLeaf, node] : [node, newLeaf];
    return { type: "split", id: crypto.randomUUID(), direction, children, sizes: [50, 50] };
  }
  const children: [PaneNode, PaneNode] = [
    splitLeafInTree(node.children[0], paneId, edge, newLeaf),
    splitLeafInTree(node.children[1], paneId, edge, newLeaf),
  ];
  return children[0] === node.children[0] && children[1] === node.children[1] ? node : { ...node, children };
}

export function resizeSplitInTree(node: PaneNode, splitId: string, sizes: [number, number]): PaneNode {
  if (node.type === "leaf") return node;
  if (node.id === splitId) return { ...node, sizes };
  const children: [PaneNode, PaneNode] = [
    resizeSplitInTree(node.children[0], splitId, sizes),
    resizeSplitInTree(node.children[1], splitId, sizes),
  ];
  return children[0] === node.children[0] && children[1] === node.children[1] ? node : { ...node, children };
}

/** Closes leaf `paneId`, collapsing its parent split into the surviving
 * sibling. Returns the unchanged tree if `paneId` isn't found, or null if
 * `paneId` is the tree's own root leaf (the last pane - callers must not let
 * this happen; the close button only renders when countLeaves(tree) > 1). */
export function closeLeafInTree(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === "leaf") return node.id === paneId ? null : node;
  const [a, b] = node.children;
  if (a.type === "leaf" && a.id === paneId) return b;
  if (b.type === "leaf" && b.id === paneId) return a;
  const newA = closeLeafInTree(a, paneId);
  if (newA !== a) return newA === null ? b : { ...node, children: [newA, b] };
  const newB = closeLeafInTree(b, paneId);
  if (newB !== b) return newB === null ? a : { ...node, children: [a, newB] };
  return node;
}

/** Sets leaf `paneId`'s zoom, and pins `pinZoom` onto every other leaf of
 * `pluginId` that has no zoom of its own, so changing the shared per-plugin
 * zoom doesn't drag unzoomed sibling panes along. */
export function setZoomInTree(node: PaneNode, paneId: string, zoom: number, pluginId: string, pinZoom: number): PaneNode {
  if (node.type === "leaf") {
    if (node.id === paneId) return { ...node, zoom };
    if (node.pluginId === pluginId && node.zoom === undefined) return { ...node, zoom: pinZoom };
    return node;
  }
  const children: [PaneNode, PaneNode] = [
    setZoomInTree(node.children[0], paneId, zoom, pluginId, pinZoom),
    setZoomInTree(node.children[1], paneId, zoom, pluginId, pinZoom),
  ];
  return children[0] === node.children[0] && children[1] === node.children[1] ? node : { ...node, children };
}

/** Copies the tree with every plugin leaf's effective zoom written in
 * (`leaf.zoom ?? pluginZoom[id] ?? 1`), for saving as a layout. */
export function resolveZoomsInTree(node: PaneNode, pluginZoom: Record<string, number>): PaneNode {
  if (node.type === "leaf") {
    return node.pluginId ? { ...node, zoom: node.zoom ?? pluginZoom[node.pluginId] ?? 1 } : node;
  }
  return {
    ...node,
    children: [resolveZoomsInTree(node.children[0], pluginZoom), resolveZoomsInTree(node.children[1], pluginZoom)],
  };
}
