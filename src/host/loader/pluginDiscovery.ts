import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

export type PluginDiscoveryEntry =
  | {
      status: "ok";
      dir: string;
      manifest: PluginManifest;
      source: string;
      disabled: boolean;
      /** Resolved from the plugin's own settings.json "category" key,
       * falling back to plugin.json's legacy category field, falling back to
       * "" (grouped under "Other") - see plugins.rs::resolve_settings_string. */
      category: string;
      /** Resolved from the plugin's own settings.json "version" key,
       * falling back to plugin.json's legacy version field, falling back to
       * "" - see plugins.rs::resolve_settings_string. */
      version: string;
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

export async function readPluginSettingsFile(dir: string): Promise<string> {
  return invoke<string>("read_plugin_settings_file", { dir });
}

export async function writePluginSettingsFile(dir: string, contents: string): Promise<void> {
  return invoke("write_plugin_settings_file", { dir, contents });
}
