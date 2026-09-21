import { premadePalettes, type NamedPalette } from "../../shared/palette";

/** Combines the built-in premade palettes with the user's custom palettes for
 * display in Settings > Themes: a custom palette sharing a premade's id
 * overrides its colors in place (rather than appearing as a duplicate entry),
 * a hidden premade (with no override) is dropped, remaining custom palettes
 * are appended, and the whole list is sorted alphabetically by name. */
export function mergePalettes(customPalettes: NamedPalette[], hiddenPaletteIds: string[]): NamedPalette[] {
  const overrideMap = new Map(customPalettes.map((c) => [c.id, c] as const));
  const mergedPremade = premadePalettes
    .filter((pp) => overrideMap.has(pp.id) || !hiddenPaletteIds.includes(pp.id))
    .map((pp) => overrideMap.get(pp.id) ?? pp);
  const pureCustom = customPalettes.filter((c) => !premadePalettes.some((pp) => pp.id === c.id));
  return [...mergedPremade, ...pureCustom].sort((a, b) => a.name.localeCompare(b.name));
}
