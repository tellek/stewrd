import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

export type PluginDiscoveryEntry =
  | { status: "ok"; dir: string; manifest: PluginManifest; source: string; disabled: boolean }
  | { status: "error"; dir: string; message: string };

export async function listPlugins(): Promise<PluginDiscoveryEntry[]> {
  return invoke<PluginDiscoveryEntry[]>("list_plugins");
}

export async function isSafeMode(): Promise<boolean> {
  return invoke<boolean>("is_safe_mode");
}

/** Call once at startup, before loading any plugin. Returns ids that were
 * auto-disabled because they were mid-load (marked) when the app last exited. */
export async function reconcileBootMarks(): Promise<string[]> {
  return invoke<string[]>("reconcile_boot_marks");
}

export async function markPluginAttempt(pluginId: string): Promise<void> {
  return invoke("mark_plugin_attempt", { pluginId });
}

export async function clearPluginAttempt(pluginId: string): Promise<void> {
  return invoke("clear_plugin_attempt", { pluginId });
}

export async function setPluginDisabled(pluginId: string, disabled: boolean): Promise<void> {
  return invoke("set_plugin_disabled", { pluginId, disabled });
}
