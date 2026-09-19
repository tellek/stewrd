import type { PluginApi } from "stewrd-plugin-api";

export interface NotepadSettings {
  defaultMode: "source" | "live-preview" | "reading";
  autosaveDebounceMs: number;
  harvesterEnabled: boolean;
  harvesterIntervalMs: number;
  lineWrap: boolean;
}

export const DEFAULT_SETTINGS: NotepadSettings = {
  defaultMode: "live-preview",
  autosaveDebounceMs: 1500,
  harvesterEnabled: false,
  harvesterIntervalMs: 15 * 60 * 1000,
  lineWrap: true,
};

const SETTINGS_KEY = "notepad-settings";

export async function loadSettings(api: PluginApi): Promise<NotepadSettings> {
  const saved = await api.storage.get<Partial<NotepadSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(api: PluginApi, settings: NotepadSettings): Promise<void> {
  await api.storage.set(SETTINGS_KEY, settings);
}
