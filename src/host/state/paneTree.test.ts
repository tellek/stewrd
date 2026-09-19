import { describe, expect, it } from "vitest";
import {
  closeLeafInTree,
  collectPaneToolIds,
  countLeaves,
  createLeaf,
  findLeaf,
  findLeafForPlugin,
  resizeSplitInTree,
  splitLeafInTree,
} from "./paneTree";

describe("splitLeafInTree", () => {
  it.each([
    ["left", "row", 0],
    ["right", "row", 1],
    ["top", "column", 0],
    ["bottom", "column", 1],
  ] as const)("splitting %s produces direction=%s with the new leaf at children[%i]", (edge, direction, newIndex) => {
    const root = createLeaf("a");
    const result = splitLeafInTree(root, root.id, edge, "b");
    expect(result.type).toBe("split");
    if (result.type !== "split") return;
    expect(result.direction).toBe(direction);
    expect(result.children[newIndex]).toMatchObject({ pluginId: "b" });
    expect(result.children[1 - newIndex]).toMatchObject({ pluginId: "a" });
    expect(result.sizes).toEqual([50, 50]);
  });

  it("leaves an unrelated leaf untouched", () => {
    const root = createLeaf("a");
    const result = splitLeafInTree(root, "not-this-id", "left", "b");
    expect(result).toBe(root);
  });
});

describe("resizeSplitInTree", () => {
  it("updates the sizes of the matching split", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "left", "b");
    const resized = resizeSplitInTree(split, split.id, [30, 70]);
    expect(resized).toMatchObject({ sizes: [30, 70] });
  });
});

describe("closeLeafInTree", () => {
  it("collapses a split back into the surviving sibling", () => {
    const root = createLeaf("a");
    const split = splitLeafInTree(root, root.id, "right", "b");
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
    const split = splitLeafInTree(root, root.id, "right", "b");
    if (split.type !== "split") throw new Error("expected split");
    const rightLeafId = split.children[1].id;
    const nested = splitLeafInTree(split, rightLeafId, "bottom", "c");

    expect(countLeaves(nested)).toBe(3);
    expect(collectPaneToolIds(nested).sort()).toEqual(["a", "b", "c"]);
    expect(findLeaf(nested, root.id)).toMatchObject({ pluginId: "a" });
    expect(findLeafForPlugin(nested, "c")).toMatchObject({ pluginId: "c" });
    expect(findLeafForPlugin(nested, "missing")).toBeNull();
  });
});
