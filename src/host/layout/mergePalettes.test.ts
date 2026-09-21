import { describe, expect, it } from "vitest";
import { mergePalettes } from "./mergePalettes";
import { premadePalettes } from "../../shared/palette";

describe("mergePalettes", () => {
  it("overrides a premade palette's colors when a custom palette shares its id", () => {
    const premade = premadePalettes[0];
    const override = { id: premade.id, name: premade.name, colors: premadePalettes[1].colors };
    const result = mergePalettes([override], []);
    const found = result.find((p) => p.id === premade.id);
    expect(found?.colors).toBe(premadePalettes[1].colors);
  });

  it("drops a hidden premade palette with no override", () => {
    const premade = premadePalettes[0];
    const result = mergePalettes([], [premade.id]);
    expect(result.some((p) => p.id === premade.id)).toBe(false);
  });

  it("keeps a hidden premade palette if it has an override", () => {
    const premade = premadePalettes[0];
    const override = { id: premade.id, name: premade.name, colors: premadePalettes[1].colors };
    const result = mergePalettes([override], [premade.id]);
    expect(result.some((p) => p.id === premade.id)).toBe(true);
  });

  it("appends a pure custom palette with a non-colliding id", () => {
    const custom = { id: "my-custom", name: "My Custom", colors: premadePalettes[0].colors };
    const result = mergePalettes([custom], []);
    expect(result.some((p) => p.id === "my-custom")).toBe(true);
  });

  it("sorts the whole result alphabetically by name", () => {
    const custom = { id: "zzz", name: "Aaa First", colors: premadePalettes[0].colors };
    const result = mergePalettes([custom], []);
    const names = result.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
