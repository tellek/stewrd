import type { PluginApi, PluginManifest, PluginModule } from "../../shared/plugin-api.d.ts";
import { clearPluginAttempt, markPluginAttempt } from "./pluginDiscovery";
import { registerBlobOwner, unregisterBlobOwner } from "./blobOwners";
import { createPluginContext, destroyPluginContext, type CreatedPluginContext } from "../api/createPluginApi";

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  api: PluginApi;
  blobUrl: string;
  /** Bumped every (re)load; lets stale async callbacks be told apart (see createPluginApi.ts). */
  generation: number;
  createdContext: CreatedPluginContext;
}

let nextGeneration = 1;

/**
 * Mark-before-run boot safety: the mark is written before `import()`, not
 * just before `activate()`, since a hang/crash during module evaluation
 * itself must also be caught. The mark is cleared only if BOTH import() and
 * activate() succeed - any failure leaves it marked so the next app launch's
 * reconcileBootMarks() auto-disables this plugin (see docs/architecture-plan.md).
 */
export async function loadPlugin(manifest: PluginManifest, source: string, dir: string = manifest.id): Promise<LoadedPlugin> {
  await markPluginAttempt(manifest.id);

  const blob = new Blob([source], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  registerBlobOwner(blobUrl, manifest.id);
  const generation = nextGeneration++;
  const createdContext = createPluginContext(manifest.id, generation, dir);

  let mod: PluginModule;
  try {
    mod = (await import(/* @vite-ignore */ blobUrl)) as PluginModule;
    await mod.activate(createdContext.ctx);
  } catch (err) {
    destroyPluginContext(createdContext);
    unregisterBlobOwner(blobUrl);
    URL.revokeObjectURL(blobUrl);
    throw err;
  }

  await clearPluginAttempt(manifest.id);
  return { manifest, module: mod, api: createdContext.ctx.api, blobUrl, generation, createdContext };
}

export function unloadPlugin(loaded: LoadedPlugin): void {
  try {
    loaded.module.deactivate?.();
  } finally {
    destroyPluginContext(loaded.createdContext);
    unregisterBlobOwner(loaded.blobUrl);
    URL.revokeObjectURL(loaded.blobUrl);
  }
}
