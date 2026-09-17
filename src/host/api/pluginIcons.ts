import { invoke } from "@tauri-apps/api/core";

export interface PluginIconUrls {
  png?: string;
}

export function getPluginIcon(dir: string): Promise<PluginIconUrls> {
  return invoke<PluginIconUrls>("get_plugin_icon", { dir });
}
