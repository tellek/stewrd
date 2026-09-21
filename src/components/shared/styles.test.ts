import { describe, expect, it } from "vitest";
import { isLight, contrastText, scrimColor } from "./styles";
import { premadePalettes } from "../../shared/palette";

describe("isLight", () => {
  it("returns true for a light 6-char hex color", () => {
    expect(isLight("#ffffff")).toBe(true);
  });

  it("returns false for a dark 6-char hex color", () => {
    expect(isLight("#000000")).toBe(false);
  });

  it("handles 3-char shorthand hex", () => {
    expect(isLight("#fff")).toBe(true);
    expect(isLight("#000")).toBe(false);
  });
});

describe("contrastText", () => {
  const dark = premadePalettes.find((p) => p.id === "dark")!.colors;
  const light = premadePalettes.find((p) => p.id === "light")!.colors;

  it("returns palette.background when the background shares palette.text's lightness", () => {
    // dark palette: text is light, and a light background shares that lightness -> falls back to palette.background
    expect(contrastText(dark, light.background)).toBe(dark.background);
  });

  it("returns palette.text when the background's lightness differs from palette.text's lightness", () => {
    // dark palette: text is light; a dark background's lightness differs from text's -> palette.text still contrasts
    expect(contrastText(dark, dark.background)).toBe(dark.text);
  });
});

describe("scrimColor", () => {
  const dark = premadePalettes.find((p) => p.id === "dark")!.colors;
  const light = premadePalettes.find((p) => p.id === "light")!.colors;

  it("uses the default alpha for a dark background", () => {
    expect(scrimColor(dark)).toBe("rgba(0,0,0,0.5)");
  });

  it("boosts alpha (capped at 0.85) for a light background", () => {
    expect(scrimColor(light)).toBe("rgba(0,0,0,0.65)");
  });

  it("caps the boosted alpha at 0.85 for a light background", () => {
    expect(scrimColor(light, 0.8)).toBe("rgba(0,0,0,0.85)");
  });
});
