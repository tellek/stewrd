import { createStorageApi } from "../api/storage";
import type { CategoryDef } from "../../shared/category";
import type { NamedPalette } from "../../shared/palette";

// Host-level settings (categories, theme) reuse the same per-plugin
// storage.rs mechanism as plugins, namespaced under a reserved id that no
// real plugin can collide with.
const storage = createStorageApi("__host__");

export interface HostSettings {
  categories: CategoryDef[];
  paletteId: string;
  customPalettes: NamedPalette[];
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
