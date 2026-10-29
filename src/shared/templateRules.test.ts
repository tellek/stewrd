import { describe, expect, it } from "vitest";

// plugins/_template is copied wholesale into new plugins, so it must follow the
// plugin rules itself (plugins/CLAUDE.md): UI only through api.ui.*, colors only
// from the palette. This guards against raw elements and hex literals creeping back.
const files = import.meta.glob("../../plugins/_template/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function code(source: string): string {
  // Drop comments so a mention in prose doesn't trip the check.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("plugins/_template follows the plugin rules", () => {
  it("scans the template sources", () => {
    expect(Object.keys(files).length).toBeGreaterThan(5);
  });

  for (const [file, source] of Object.entries(files)) {
    const name = file.replace(/^.*_template\//, "");
    it(`${name} has no raw <button>/<input>/<select> elements`, () => {
      expect(code(source)).not.toMatch(/<(button|input|select)[\s>/]/);
    });
    it(`${name} has no hex color literals`, () => {
      expect(code(source)).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/);
    });
  }
});
