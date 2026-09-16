import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PluginApi, PluginManifest, PluginModule } from "../../shared/plugin-api.d.ts";
import { isSafeMode, listPlugins, reconcileBootMarks } from "./pluginDiscovery";
import { loadPlugin, unloadPlugin, type LoadedPlugin } from "./pluginLoader";

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
}

export interface DiscoveryError {
  dir: string;
  message: string;
}

export function usePluginRegistry() {
  const [entries, setEntries] = useState<Record<string, PluginRegistryEntry>>({});
  const [discoveryErrors, setDiscoveryErrors] = useState<DiscoveryError[]>([]);
  const [safeMode, setSafeMode] = useState(false);
  const loadedByDir = useRef<Map<string, LoadedPlugin>>(new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const loadOneRef = useRef<((dir: string, manifest: PluginManifest, source: string) => Promise<void>) | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOne(dir: string, manifest: PluginManifest, source: string) {
      try {
        const loaded = await loadPlugin(manifest, source);
        if (cancelled) {
          unloadPlugin(loaded);
          return;
        }
        const prev = loadedByDir.current.get(dir);
        if (prev) unloadPlugin(prev);
        loadedByDir.current.set(dir, loaded);
        setEntries((e) => ({
          ...e,
          [manifest.id]: {
            manifest,
            Component: loaded.module.Component,
            api: loaded.api,
            generation: loaded.generation,
            loaded: true,
            dir,
          },
        }));
      } catch (err) {
        console.error(`[plugin:${manifest.id}] load failed`, err);
        setEntries((e) => ({
          ...e,
          [manifest.id]: {
            manifest,
            Component: () => null,
            api: null,
            generation: -1,
            loadError: err instanceof Error ? err.message : String(err),
            loaded: false,
            dir,
          },
        }));
      }
    }
    loadOneRef.current = loadOne;

    async function discoverAndLoadAll() {
      const discovered = await listPlugins();
      if (cancelled) return;
      setDiscoveryErrors(
        discovered
          .filter((d): d is Extract<typeof d, { status: "error" }> => d.status === "error")
          .map((d) => ({ dir: d.dir, message: d.message })),
      );
      const safe = await isSafeMode();
      if (cancelled) return;
      setSafeMode(safe);
      if (safe) return; // manual escape hatch: load nothing

      const ok = discovered.filter((d): d is Extract<typeof d, { status: "ok" }> => d.status === "ok" && !d.disabled);

      // background: true activates eagerly now; everything else is merely
      // listed (so the sidebar can show it) and stays lazy until first
      // selected - see ensureLoaded. This shrinks eager-activation blast
      // radius to only the plugins that actually declare they need it.
      const eager = ok.filter((d) => d.manifest.background);
      const lazy = ok.filter((d) => !d.manifest.background);

      setEntries((e) => {
        const next = { ...e };
        for (const d of lazy) {
          if (!next[d.manifest.id]) {
            next[d.manifest.id] = {
              manifest: d.manifest,
              Component: () => null,
              api: null,
              generation: -1,
              loaded: false,
              dir: d.dir,
            };
          }
        }
        return next;
      });

      await Promise.all(eager.map((d) => loadOne(d.dir, d.manifest, d.source)));
    }

    (async () => {
      await reconcileBootMarks();
      if (cancelled) return;
      await discoverAndLoadAll();
    })().catch((err) => console.error("[plugin-registry] init failed", err));

    const unlistenPromise = listen<string>("plugin-changed", async (event) => {
      const changedDir = event.payload;
      const discovered = await listPlugins();
      const match = discovered.find(
        (d): d is Extract<typeof d, { status: "ok" }> => d.status === "ok" && d.dir === changedDir,
      );

      if (!match || match.disabled) {
        // Hot-remove: the plugin's folder/dist output is gone (or now
        // disabled) - unload it if it was actually loaded, and remove its
        // entry entirely (including a lazy entry that was only ever listed,
        // never loaded, which loadedByDir never tracked) so a stale sidebar
        // entry doesn't linger until the app restarts.
        const previouslyLoaded = loadedByDir.current.get(changedDir);
        if (previouslyLoaded) {
          unloadPlugin(previouslyLoaded);
          loadedByDir.current.delete(changedDir);
        }
        setEntries((e) => {
          const staleId = Object.keys(e).find((id) => e[id].dir === changedDir);
          if (!staleId) return e;
          const next = { ...e };
          delete next[staleId];
          return next;
        });
        return;
      }

      const known = entriesRef.current[match.manifest.id];
      if (known?.loaded) {
        // Already loaded (eager, or a previously-selected lazy one) - hot-reload it.
        await loadOne(match.dir, match.manifest, match.source);
      } else if (!known) {
        // Hot-add: a brand-new plugin folder appeared while running.
        if (match.manifest.background) {
          await loadOne(match.dir, match.manifest, match.source);
        } else {
          setEntries((e) => ({
            ...e,
            [match.manifest.id]: {
              manifest: match.manifest,
              Component: () => null,
              api: null,
              generation: -1,
              loaded: false,
              dir: match.dir,
            },
          }));
        }
      }
      // else: known but not loaded (untouched lazy plugin) - stays lazy, no-op.
    });

    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten());
      for (const loaded of loadedByDir.current.values()) unloadPlugin(loaded);
      loadedByDir.current.clear();
    };
  }, []);

  const reloadPlugin = useCallback(async (pluginId: string) => {
    const discovered = await listPlugins();
    const match = discovered.find(
      (d): d is Extract<typeof d, { status: "ok" }> => d.status === "ok" && d.manifest.id === pluginId,
    );
    if (match) await loadOneRef.current?.(match.dir, match.manifest, match.source);
  }, []);

  /** Call when a plugin is selected in the sidebar for the first time - a
   * no-op if it's already loaded (eager, or a previously-selected lazy one). */
  const ensureLoaded = useCallback(
    async (pluginId: string) => {
      if (entriesRef.current[pluginId]?.loaded) return;
      await reloadPlugin(pluginId);
    },
    [reloadPlugin],
  );

  return { entries: Object.values(entries), discoveryErrors, safeMode, reloadPlugin, ensureLoaded };
}
