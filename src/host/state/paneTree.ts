/** Binary split-tree describing how the main area is divided into panes.
 * Pure, JSON-serializable (no functions) so it can be persisted as a
 * SavedLayout via hostSettings. See appStore.ts for the state that wraps
 * this and MainContent.tsx for the recursive renderer. */

export type PaneEdge = "left" | "right" | "top" | "bottom";

export interface PaneLeaf {
  type: "leaf";
  id: string;
  pluginId: string | null;
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
  if (node.type === "leaf") return node.id === paneId ? { ...node, pluginId } : node;
  const children: [PaneNode, PaneNode] = [
    setPluginInTree(node.children[0], paneId, pluginId),
    setPluginInTree(node.children[1], paneId, pluginId),
  ];
  return children[0] === node.children[0] && children[1] === node.children[1] ? node : { ...node, children };
}

/** Splits leaf `paneId` in the given edge direction, putting a new leaf for
 * `pluginId` on that side. left/right => side-by-side ("row", vertical
 * divider); top/bottom => stacked ("column", horizontal divider). */
export function splitLeafInTree(node: PaneNode, paneId: string, edge: PaneEdge, pluginId: string): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== paneId) return node;
    const newLeaf = createLeaf(pluginId);
    const direction: "row" | "column" = edge === "left" || edge === "right" ? "row" : "column";
    const children: [PaneNode, PaneNode] = edge === "left" || edge === "top" ? [newLeaf, node] : [node, newLeaf];
    return { type: "split", id: crypto.randomUUID(), direction, children, sizes: [50, 50] };
  }
  const children: [PaneNode, PaneNode] = [
    splitLeafInTree(node.children[0], paneId, edge, pluginId),
    splitLeafInTree(node.children[1], paneId, edge, pluginId),
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
