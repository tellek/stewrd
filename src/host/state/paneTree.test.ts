import { describe, expect, it } from "vitest";
import {
  closeLeafInTree,
  collectPaneToolIds,
  countLeaves,
  createLeaf,
  findLeaf,
  findLeafForPlugin,
  resizeSplitInTree,
  resolveZoomsInTree,
  setPluginInTree,
  setZoomInTree,
  splitLeafInTree,
  type PaneLeaf,
  type PaneNode,
} from "./paneTree";

describe("zoom helpers", () => {
  const pair = (a: PaneLeaf, b: PaneLeaf): PaneNode => ({
    type: "split",
    id: "s",
    direction: "row",
    children: [a, b],
    sizes: [50, 50],
  });

  it("setPluginInTree clears zoom only when the plugin changes", () => {
    const leaf: PaneLeaf = { ...createLeaf("a"), zoom: 2 };
    expect(setPluginInTree(leaf, leaf.id, "a")).toMatchObject({ zoom: 2 });
    expect((setPluginInTree(leaf, leaf.id, "b") as PaneLeaf).zoom).toBeUndefined();
  });

  it("setZoomInTree zooms the target and pins unzoomed siblings of the same plugin", () => {
    const a = createLeaf("p");
    const b = createLeaf("p");
    const tree = setZoomInTree(pair(a, b), a.id, 1.5, "p", 1.2);
    if (tree.type !== "split") throw new Error("expected split");
    expect(tree.children[0]).toMatchObject({ zoom: 1.5 });
    expect(tree.children[1]).toMatchObject({ zoom: 1.2 });
  });

  it("resolveZoomsInTree writes effective zoom into plugin leaves only", () => {
    const tree = resolveZoomsInTree(pair({ ...createLeaf("p"), zoom: 2 }, createLeaf(null)), { p: 1.3 });
    if (tree.type !== "split") throw new Error("expected split");
    expect(tree.children[0]).toMatchObject({ zoom: 2 });
    expect((tree.children[1] as PaneLeaf).zoom).toBeUndefined();
    expect(resolveZoomsInTree(createLeaf("q"), { q: 1.3 })).toMatchObject({ zoom: 1.3 });
  });
});

describe("splitLeafInTree", () => {
  it.each([
    ["left", "row", 0],
    ["right", "row", 1],
    ["top", "column", 0],
    ["bottom", "column", 1],
  ] as const)("splitting %s produces direction=%s with the new leaf at children[%i]", (edge, direction, newIndex) => {
    const root = createLeaf("a");
    const newLeaf = createLeaf("b");
    const result = splitLeafInTree(root, root.id, edge, newLeaf);
    expect(result.type).toBe("split");
    if (result.type !== "split") return;
    expect(result.direction).toBe(direction);
    expect(result.children[newIndex]).toBe(newLeaf);
    expect(result.children[1 - newIndex]).toMatchObject({ pluginId: "a" });
    expect(result.sizes).toEqual([50, 50]);
  });

  it("leaves an unrelated leaf untouched", () => {
    const root = createLeaf("a");
    const result = splitLeafInTree(root, "not-this-id", "left", createLeaf("b"));
    expect(result).toBe(root);
  });
});

describe("resizeSplitInTree", () => {
  it("updates the sizes of the matching split", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "left", createLeaf("b"));
    const resized = resizeSplitInTree(split, split.id, [30, 70]);
    expect(resized).toMatchObject({ sizes: [30, 70] });
  });

  it("keeps resized sizes through a saved-layout clone round-trip", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "right", createLeaf("b"));
    if (split.type !== "split") throw new Error("expected split");
    const nested = splitLeafInTree(split, split.children[1].id, "bottom", createLeaf("c"));
    if (nested.type !== "split") throw new Error("expected split");
    const outerResized = resizeSplitInTree(nested, nested.id, [30, 70]);
    if (outerResized.type !== "split") throw new Error("expected split");
    const innerId = outerResized.children[1].id;
    const resized = resizeSplitInTree(outerResized, innerId, [25, 75]);

    // saveLayout stores structuredClone(tree); applyLayout clones it back.
    const roundTripped = structuredClone(structuredClone(resized));
    expect(roundTripped).toEqual(resized);
    expect(roundTripped).toMatchObject({ sizes: [30, 70] });
    if (roundTripped.type !== "split") throw new Error("expected split");
    expect(roundTripped.children[1]).toMatchObject({ sizes: [25, 75] });
  });
});

describe("closeLeafInTree", () => {
  it("collapses a split back into the surviving sibling", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "right", createLeaf("b"));
    if (split.type !== "split") throw new Error("expected split");
    const [left] = split.children;
    const result = closeLeafInTree(split, split.children[1].id);
    expect(result).toBe(left);
  });

  it("returns null when closing the tree's only leaf", () => {
    const root = createLeaf("a");
    expect(closeLeafInTree(root, root.id)).toBeNull();
  });
});

describe("collectPaneToolIds / countLeaves / findLeaf / findLeafForPlugin", () => {
  it("walks a multi-level tree", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "right", createLeaf("b"));
    if (split.type !== "split") throw new Error("expected split");
    const rightLeafId = split.children[1].id;
    const nested = splitLeafInTree(split, rightLeafId, "bottom", createLeaf("c"));

    expect(countLeaves(nested)).toBe(3);
    expect(collectPaneToolIds(nested).sort()).toEqual(["a", "b", "c"]);
    expect(findLeaf(nested, root.id)).toMatchObject({ pluginId: "a" });
    expect(findLeafForPlugin(nested, "c")).toMatchObject({ pluginId: "c" });
    expect(findLeafForPlugin(nested, "missing")).toBeNull();
  });
});
