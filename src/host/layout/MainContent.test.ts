import { describe, expect, it } from "vitest";
import { detectEdgeAt, clampPanePercent } from "./MainContent";

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
    ...overrides,
  } as DOMRect;
}

describe("detectEdgeAt", () => {
  it("detects the left edge", () => {
    expect(detectEdgeAt(10, 50, rect())).toBe("left");
  });

  it("detects the right edge", () => {
    expect(detectEdgeAt(90, 50, rect())).toBe("right");
  });

  it("detects the top edge", () => {
    expect(detectEdgeAt(50, 10, rect())).toBe("top");
  });

  it("detects the bottom edge", () => {
    expect(detectEdgeAt(50, 90, rect())).toBe("bottom");
  });

  it("detects center for a point away from all edges", () => {
    expect(detectEdgeAt(50, 50, rect())).toBe("center");
  });

  it("treats exactly the 20% margin boundary as center, not an edge", () => {
    expect(detectEdgeAt(20, 50, rect())).toBe("center");
    expect(detectEdgeAt(80, 50, rect())).toBe("center");
  });
});

describe("clampPanePercent", () => {
  it("clamps a value below MIN_PANE_PERCENT up to 15", () => {
    expect(clampPanePercent(5)).toBe(15);
  });

  it("clamps a value above 85 down to 85", () => {
    expect(clampPanePercent(95)).toBe(85);
  });

  it("passes an in-range value through unchanged", () => {
    expect(clampPanePercent(50)).toBe(50);
  });
});
