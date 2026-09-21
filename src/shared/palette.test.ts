import { describe, expect, it } from "vitest";
import { premadePalettes } from "./palette";

const PALETTE_KEYS = ["background", "surface", "surfaceHover", "text", "textMuted", "border", "accent"] as const;
const STATUS_KEYS = ["idle", "in-progress", "success", "warning", "error"] as const;

describe("premadePalettes", () => {
  for (const entry of premadePalettes) {
    it(`${entry.name} (${entry.id}) has all required Palette and StatusColor keys`, () => {
      for (const key of PALETTE_KEYS) {
        expect(typeof entry.colors[key]).toBe("string");
      }
      for (const key of STATUS_KEYS) {
        expect(typeof entry.colors.status[key]).toBe("string");
      }
    });
  }
});
