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

// saveHostSettings is fire-and-forget (callers are synchronous zustand
// actions) - each write's promise is tracked here so flushHostSettings()
// can await them all before the window is allowed to actually close. Without
// this, a save triggered right before quitting (e.g. a sidebar-collapse
// click, then immediately closing the app) can lose the write: the webview
// tears down before the async storage_set IPC round-trip completes.
const pendingWrites = new Set<Promise<unknown>>();

export function saveHostSettings(partial: Partial<HostSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    const write = storage.set(key, value).catch((err) => console.error("[hostSettings] save failed", key, err));
    pendingWrites.add(write);
    write.finally(() => pendingWrites.delete(write));
  }
}

export async function flushHostSettings(): Promise<void> {
  await Promise.all(pendingWrites);
}
