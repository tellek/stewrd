import { describe, expect, it } from "vitest";
import { partitionDiscovered, decidePluginChange, type PluginRegistryEntry, type OkDiscoveryEntry } from "./pluginRegistryReducer";
import type { PluginDiscoveryEntry } from "./pluginDiscovery";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "p",
    name: "P",
    icon: "icon.png",
    entry: "index.tsx",
    description: "",
    apiVersion: "1",
    background: false,
    ...overrides,
  } as PluginManifest;
}

function okEntry(overrides: Partial<OkDiscoveryEntry> = {}): OkDiscoveryEntry {
  return {
    status: "ok",
    dir: "dir",
    manifest: manifest(),
    source: "",
    disabled: false,
    category: "",
    version: "",
    ...overrides,
  } as OkDiscoveryEntry;
}

function registryEntry(overrides: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    manifest: manifest(),
    Component: (() => null) as unknown as PluginRegistryEntry["Component"],
    api: null,
    generation: 0,
    loaded: false,
    dir: "dir",
    category: "",
    ...overrides,
  };
}

describe("partitionDiscovered", () => {
  it("collects error entries with dir and message", () => {
    const discovered: PluginDiscoveryEntry[] = [{ status: "error", dir: "bad", message: "boom" }];
    const { errors } = partitionDiscovered(discovered);
    expect(errors).toEqual([{ dir: "bad", message: "boom" }]);
  });

  it("drops disabled entries entirely", () => {
    const discovered: PluginDiscoveryEntry[] = [okEntry({ disabled: true })];
    const { eager, lazy } = partitionDiscovered(discovered);
    expect(eager).toEqual([]);
    expect(lazy).toEqual([]);
  });

  it("routes background:true entries to eager and others to lazy", () => {
    const bg = okEntry({ dir: "bg", manifest: manifest({ id: "bg", background: true }) });
    const fg = okEntry({ dir: "fg", manifest: manifest({ id: "fg", background: false }) });
    const { eager, lazy } = partitionDiscovered([bg, fg]);
    expect(eager).toEqual([bg]);
    expect(lazy).toEqual([fg]);
  });
});

describe("decidePluginChange", () => {
  it("returns remove when match is undefined", () => {
    expect(decidePluginChange(undefined, undefined)).toEqual({ kind: "remove" });
  });

  it("returns remove when match is disabled", () => {
    expect(decidePluginChange(okEntry({ disabled: true }), undefined)).toEqual({ kind: "remove" });
  });

  it("returns hot-reload when known is loaded", () => {
    expect(decidePluginChange(okEntry(), registryEntry({ loaded: true }))).toEqual({ kind: "hot-reload" });
  });

  it("returns hot-add-eager for a brand-new background plugin", () => {
    expect(decidePluginChange(okEntry({ manifest: manifest({ background: true }) }), undefined)).toEqual({
      kind: "hot-add-eager",
    });
  });

  it("returns hot-add-lazy for a brand-new non-background plugin", () => {
    expect(decidePluginChange(okEntry({ manifest: manifest({ background: false }) }), undefined)).toEqual({
      kind: "hot-add-lazy",
    });
  });

  it("returns metadata-refresh when known exists but isn't loaded", () => {
    expect(decidePluginChange(okEntry(), registryEntry({ loaded: false }))).toEqual({ kind: "metadata-refresh" });
  });
});
