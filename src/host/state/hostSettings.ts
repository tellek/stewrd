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
  /** Plugin ids that have registered sidebar sub-items at least once (via
   * api.sidebar.setItems) - lets the sidebar show a lazy (background: false)
   * plugin's disclosure triangle at startup, before it's been activated this
   * session and the real item list is known. See appStore.ts's
   * setSidebarItems. */
  pluginsWithSidebarItems: string[];
  /** Per-plugin sidebar sub-item expand/collapse state, keyed by plugin id -
   * missing = expanded (a tool defaults to expanded the first time it's
   * activated and registers items). See appStore.ts's
   * toggleSidebarSubItemsExpanded. */
  sidebarSubItemsExpanded: Record<string, boolean>;
}

export async function loadHostSettings(): Promise<Partial<HostSettings>> {
  const all = await storage.getAll<Record<string, unknown>>();
  return all as Partial<HostSettings>;
}

// saveHostSettings is fire-and-forget - callers are synchronous zustand
// actions. A write started microseconds before the app quits can be lost;
// that is accepted deliberately (see the note in App.tsx about the
// close-requested interception that made the window unclosable).
export function saveHostSettings(partial: Partial<HostSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    storage.set(key, value).catch((err) => console.error("[hostSettings] save failed", key, err));
  }
}
