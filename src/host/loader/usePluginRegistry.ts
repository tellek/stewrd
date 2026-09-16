import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PluginManifest, PluginModule } from "../../shared/plugin-api.d.ts";
import { isSafeMode, listPlugins, reconcileBootMarks } from "./pluginDiscovery";
import { loadPlugin, unloadPlugin, type LoadedPlugin } from "./pluginLoader";

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  Component: PluginModule["Component"];
  generation: number;
  loadError?: string;
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
  const loadOneRef = useRef<((dir: string, manifest: PluginManifest, source: string) => Promise<void>) | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOne(dir: string, manifest: PluginManifest, source: string) {
      try {
        const loaded = await loadPlugin(manifest, source, { pluginId: manifest.id });
        if (cancelled) {
          unloadPlugin(loaded);
          return;
        }
        const prev = loadedByDir.current.get(dir);
        if (prev) unloadPlugin(prev);
        loadedByDir.current.set(dir, loaded);
        setEntries((e) => ({
          ...e,
          [manifest.id]: { manifest, Component: loaded.module.Component, generation: loaded.generation },
        }));
      } catch (err) {
        console.error(`[plugin:${manifest.id}] load failed`, err);
        setEntries((e) => ({
          ...e,
          [manifest.id]: {
            manifest,
            Component: () => null,
            generation: -1,
            loadError: err instanceof Error ? err.message : String(err),
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
      await Promise.all(ok.map((d) => loadOne(d.dir, d.manifest, d.source)));
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
      if (match && !match.disabled) {
        await loadOne(match.dir, match.manifest, match.source);
      }
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

  return { entries: Object.values(entries), discoveryErrors, safeMode, reloadPlugin };
}
