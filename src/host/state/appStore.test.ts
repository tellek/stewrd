import { describe, expect, it } from "vitest";
import { resolvePalette } from "./appStore";
import { premadePalettes } from "../../shared/palette";

describe("resolvePalette", () => {
  it("resolves a premade palette by id", () => {
    expect(resolvePalette("light", [])).toBe(premadePalettes[1].colors);
  });

  it("resolves a custom palette by id", () => {
    const custom = { id: "mine", name: "Mine", colors: premadePalettes[0].colors };
    expect(resolvePalette("mine", [custom])).toBe(custom.colors);
  });

  it("falls back to the first premade palette (Dark) for an unknown id", () => {
    expect(resolvePalette("deleted-custom-palette", [])).toBe(premadePalettes[0].colors);
  });
});
