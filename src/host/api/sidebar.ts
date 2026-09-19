import { useAppStore } from "../state/appStore";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

export interface SidebarApi {
  /** Replace this plugin's sidebar sub-items - pass [] to hide them. The
   * plugin owns the full list, when it's shown/hidden, and what each click
   * does (via the item's own onClick). */
  setItems(items: SidebarItem[]): void;
  /** Sets which item renders highlighted - the host also does this itself on
   * click, so this is only needed to reflect selection changed some other way. */
  setSelected(id: string | null): void;
}

/** Guarded the same way createPluginApi.ts guards statusIcon/toast - a call
 * from a stale (superseded) generation throws instead of silently mutating
 * live state for a plugin that's no longer that generation. */
export function createSidebarApi(pluginId: string, isCurrent: () => boolean): SidebarApi {
  return {
    setItems(items) {
      if (!isCurrent()) throw new Error(`[plugin:${pluginId}] api call after deactivation`);
      useAppStore.getState().setSidebarItems(pluginId, items);
    },
    setSelected(id) {
      if (!isCurrent()) throw new Error(`[plugin:${pluginId}] api call after deactivation`);
      useAppStore.getState().setSidebarSelected(pluginId, id);
    },
  };
}
