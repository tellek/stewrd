import { readPluginSettingsFile } from "../loader/pluginDiscovery";

/** Shape plugin authors see as `api.settings`. */
export interface SettingsApi {
  /** Reads the plugin's own `settings.json` fresh from disk. A missing or
   * malformed file reads as `{}`. Saving the file (Settings > Plugins >
   * Configure) hot-reloads the plugin, so `activate()` re-runs and a plain
   * `get()` there always sees the new values; there is no subscribe. */
  get<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T>;
}

/** `dir` is the plugin's folder name (what read_plugin_settings_file takes),
 * which can differ from its manifest id. */
export function createSettingsApi(dir: string): SettingsApi {
  return {
    async get<T extends Record<string, unknown>>(): Promise<T> {
      try {
        const parsed: unknown = JSON.parse(await readPluginSettingsFile(dir));
        return (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as T;
      } catch {
        return {} as T;
      }
    },
  };
}
