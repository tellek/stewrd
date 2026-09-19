import { createStorageApi } from "../api/storage";
import type { CategoryDef } from "../../shared/category";
import type { NamedPalette } from "../../shared/palette";

// Host-level settings (categories, theme) reuse the same per-plugin
// storage.rs mechanism as plugins, namespaced under a reserved id that no
// real plugin can collide with.
const storage = createStorageApi("__host__");

export type TaskbarBadgeThreshold = "off" | "success" | "warning" | "error";

export interface HostSettings {
  categories: CategoryDef[];
  paletteId: string;
  customPalettes: NamedPalette[];
  hiddenPaletteIds: string[];
  taskbarBadgeThreshold: TaskbarBadgeThreshold;
  /** Plugin ids in sidebar display order (within their resolved category) -
   * see appStore.ts's movePlugin. Ids missing from this list (new plugins)
   * sort after everything listed here. */
  pluginOrder: string[];
}

export async function loadHostSettings(): Promise<Partial<HostSettings>> {
  const all = await storage.getAll<Record<string, unknown>>();
  return all as Partial<HostSettings>;
}

export function saveHostSettings(partial: Partial<HostSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    void storage.set(key, value);
  }
}
