import type { PluginManifest, PluginModule } from "../../shared/plugin-api.d.ts";
import { clearPluginAttempt, markPluginAttempt } from "./pluginDiscovery";

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  blobUrl: string;
  /** Bumped every (re)load; lets stale async callbacks be told apart from Milestone 4 onward. */
  generation: number;
}

let nextGeneration = 1;

/**
 * Mark-before-run boot safety: the mark is written before `import()`, not
 * just before `activate()`, since a hang/crash during module evaluation
 * itself must also be caught. The mark is cleared only if BOTH import() and
 * activate() succeed - any failure leaves it marked so the next app launch's
 * reconcileBootMarks() auto-disables this plugin (see docs/architecture-plan.md).
 */
export async function loadPlugin(
  manifest: PluginManifest,
  source: string,
  ctx: { pluginId: string },
): Promise<LoadedPlugin> {
  await markPluginAttempt(manifest.id);

  const blob = new Blob([source], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  let mod: PluginModule;
  try {
    mod = (await import(/* @vite-ignore */ blobUrl)) as PluginModule;
    await mod.activate(ctx);
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
    throw err;
  }

  await clearPluginAttempt(manifest.id);
  return { manifest, module: mod, blobUrl, generation: nextGeneration++ };
}

export function unloadPlugin(loaded: LoadedPlugin): void {
  try {
    loaded.module.deactivate?.();
  } finally {
    URL.revokeObjectURL(loaded.blobUrl);
  }
}
