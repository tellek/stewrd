// This plugin has no inline settings UI - every option is a field in this
// plugin's own settings.json, editable via Settings > Plugins > Configure
// (the same raw-JSON screen every plugin's settings.json already goes
// through). `read_plugin_settings_file` is an existing, already-registered
// host command (see src-tauri/src/commands/plugin_settings.rs) - reusing it
// directly needs no host changes at all.
import { invoke } from "@tauri-apps/api/core";

export interface NotepadSettings {
  defaultMode: "source" | "live-preview" | "reading";
  autosaveDebounceMs: number;
  harvesterEnabled: boolean;
  harvesterIntervalMs: number;
}

export const DEFAULT_SETTINGS: NotepadSettings = {
  defaultMode: "live-preview",
  autosaveDebounceMs: 1000,
  harvesterEnabled: false,
  harvesterIntervalMs: 15 * 60 * 1000,
};

export async function loadSettings(pluginId: string): Promise<NotepadSettings> {
  try {
    const raw = await invoke<string>("read_plugin_settings_file", { dir: pluginId });
    const parsed = JSON.parse(raw) as Partial<NotepadSettings>;
    return {
      defaultMode:
        parsed.defaultMode === "source" || parsed.defaultMode === "reading" || parsed.defaultMode === "live-preview"
          ? parsed.defaultMode
          : DEFAULT_SETTINGS.defaultMode,
      autosaveDebounceMs: typeof parsed.autosaveDebounceMs === "number" ? parsed.autosaveDebounceMs : DEFAULT_SETTINGS.autosaveDebounceMs,
      harvesterEnabled: typeof parsed.harvesterEnabled === "boolean" ? parsed.harvesterEnabled : DEFAULT_SETTINGS.harvesterEnabled,
      harvesterIntervalMs: typeof parsed.harvesterIntervalMs === "number" ? parsed.harvesterIntervalMs : DEFAULT_SETTINGS.harvesterIntervalMs,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
