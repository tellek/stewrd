import { describe, expect, it } from "vitest";
import hostApi from "./plugin-api.d.ts?raw";
import ambientApi from "../../plugins/.stewrd/plugin-api.d.ts?raw";
import implApi from "../host/api/createPluginApi.ts?raw";

// The plugin contract is declared twice and kept in sync by hand: the host's
// src/shared/plugin-api.d.ts and the ambient-module copy that ships to
// installs (plugins/.stewrd/plugin-api.d.ts). They differ in layout, so this
// compares the member names of PluginApi and its `ui` block (and the host's
// createPluginApi.ts wiring) rather than the text.

/** Member names at depth 1 of the `{ ... }` that follows `marker`, depth-aware. */
function memberNames(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const open = source.indexOf("{", start);
  const names: string[] = [];
  let depth = 0;
  let i = open;
  let lineStart = open + 1;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) break;
    } else if (ch === "\n" && depth === 1) lineStart = i + 1;
    else if (ch === ":" && depth === 1) {
      const m = source.slice(lineStart, i).match(/^\s*(\w+)\??\s*$/);
      if (m) names.push(m[1]);
    }
  }
  return names.sort();
}

describe("plugin-api.d.ts copies", () => {
  const host = hostApi;
  const ambient = ambientApi;

  it("declare the same PluginApi members", () => {
    expect(memberNames(ambient, "export interface PluginApi")).toEqual(memberNames(host, "export interface PluginApi"));
  });

  it("declare the same api.ui components", () => {
    const hostUi = memberNames(memberBlock(host), "ui:");
    expect(memberNames(memberBlock(ambient), "ui:")).toEqual(hostUi);
  });

  it("are wired in createPluginApi.ts: every declared ui component and top-level member is provided", () => {
    const impl = implApi;
    const uiBlock = impl.slice(impl.indexOf("ui: {"), impl.indexOf("},", impl.indexOf("CodeTextArea,")));
    const implUi = [...uiBlock.matchAll(/^\s+(\w+),$/gm)].map((m) => m[1]).sort();
    expect(implUi).toEqual(memberNames(memberBlock(host), "ui:"));
    for (const member of memberNames(host, "export interface PluginApi")) {
      const wired = impl.includes(member + ":") || impl.includes(member + ",");
      expect(wired, `createPluginApi.ts is missing api.${member}`).toBe(true);
    }
  });
});

/** The text of the PluginApi interface body, so `ui:` is found inside it. */
function memberBlock(source: string): string {
  const start = source.indexOf("export interface PluginApi");
  return source.slice(start);
}
