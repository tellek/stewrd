import type { PluginApi, PluginManifest, PluginModule } from "../../shared/plugin-api.d.ts";
import type { PluginDiscoveryEntry } from "./pluginDiscovery";

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  Component: PluginModule["Component"];
  api: PluginApi | null;
  generation: number;
  loadError?: string;
  /** false = discovered but not yet activated (lazy, background: false,
   * waiting for first sidebar selection - see ensureLoaded). */
  loaded: boolean;
  /** Discovery directory name - needed to reverse-lookup an entry on
   * hot-remove even if it was never actually loaded (lazy). */
  dir: string;
  /** Resolved category from discovery (settings.json, falling back to
   * plugin.json) - see pluginDiscovery.ts's PluginDiscoveryEntry. */
  category: string;
}

export interface DiscoveryError {
  dir: string;
  message: string;
}

export type OkDiscoveryEntry = Extract<PluginDiscoveryEntry, { status: "ok" }>;

/** Splits discovery results into startup-relevant buckets: errored entries,
 * plugins to activate eagerly now (`background: true`), and plugins to only
 * list (lazy, activated later via ensureLoaded). Disabled entries are
 * dropped entirely - they don't even get a lazy listing. */
export function partitionDiscovered(discovered: PluginDiscoveryEntry[]): {
  errors: DiscoveryError[];
  eager: OkDiscoveryEntry[];
  lazy: OkDiscoveryEntry[];
} {
  const errors = discovered
    .filter((d): d is Extract<PluginDiscoveryEntry, { status: "error" }> => d.status === "error")
    .map((d) => ({ dir: d.dir, message: d.message }));
  const ok = discovered.filter((d): d is OkDiscoveryEntry => d.status === "ok" && !d.disabled);
  const eager = ok.filter((d) => d.manifest.background);
  const lazy = ok.filter((d) => !d.manifest.background);
  return { errors, eager, lazy };
}

export type PluginChangeDecision =
  /** The plugin's folder/dist output is gone, or it's now disabled - unload
   * it (if it was loaded) and drop its entry entirely. */
  | { kind: "remove" }
  /** Already loaded (eager, or a previously-selected lazy one) - reload it. */
  | { kind: "hot-reload" }
  /** Brand-new plugin folder that declares background: true - load it now. */
  | { kind: "hot-add-eager" }
  /** Brand-new plugin folder that doesn't declare background: true - just
   * list it (lazy), don't activate. */
  | { kind: "hot-add-lazy" }
  /** Known but not loaded (untouched lazy plugin) - only its manifest/category
   * metadata changed (e.g. a settings.json edit); update in place. */
  | { kind: "metadata-refresh" };

/** Pure decision for what a `plugin-changed` event should do to one plugin's
 * registry entry, given the freshly re-discovered entry for its dir (or
 * undefined/disabled, meaning it's gone) and the currently-known registry
 * entry for that plugin id (or undefined, meaning it's brand new). */
export function decidePluginChange(
  match: OkDiscoveryEntry | undefined,
  known: PluginRegistryEntry | undefined,
): PluginChangeDecision {
  if (!match || match.disabled) return { kind: "remove" };
  if (known?.loaded) return { kind: "hot-reload" };
  if (!known) return match.manifest.background ? { kind: "hot-add-eager" } : { kind: "hot-add-lazy" };
  return { kind: "metadata-refresh" };
}
