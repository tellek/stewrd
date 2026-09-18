import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

/** One configurable setting a plugin's optional `settings.json` declares.
 * Values live in the plugin's own storage file (see `host/api/storage.ts`)
 * under a key matching `key` - this is just the schema the Settings >
 * Plugins UI renders a form from. */
export interface SettingsField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default: unknown;
  options: string[]; // only used when type === "select"
}

export type PluginDiscoveryEntry =
  | {
      status: "ok";
      dir: string;
      manifest: PluginManifest;
      source: string;
      disabled: boolean;
      settingsSchema: SettingsField[];
    }
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

export async function setPluginDisabled(pluginId: string, dir: string, disabled: boolean): Promise<void> {
  return invoke("set_plugin_disabled", { pluginId, dir, disabled });
}

export async function removePlugin(dir: string): Promise<void> {
  return invoke("remove_plugin", { dir });
}

export async function installPluginFromArchive(bytes: Uint8Array, fileName: string): Promise<string> {
  return invoke<string>("install_plugin_from_archive", { bytes: Array.from(bytes), fileName });
}
