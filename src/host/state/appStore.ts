import { create } from "zustand";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";
import type { NamedPalette, Palette, StatusColor } from "../../shared/palette";
import { premadePalettes } from "../../shared/palette";
import type { CategoryDef } from "../../shared/category";
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_ID } from "../../shared/category";
import { loadHostSettings, saveHostSettings, type TaskbarBadgeThreshold } from "./hostSettings";
import { listCategoryIcons, type CategoryIconFile } from "../api/categoryIcons";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";

// Stable empty-array reference for the common case (a plugin with no
// registered sidebar items) - a fresh `[]` literal returned from a selector
// on every read would break zustand/useSyncExternalStore's reference-equality
// snapshot check.
const EMPTY_SIDEBAR_ITEMS: SidebarItem[] = [];

export interface PluginSidebarEntry {
  manifest: PluginManifest;
  status: StatusColor;
  statusTooltip?: string;
  /** Discovery directory name - needed to fetch the plugin's icon.png. */
  dir: string;
  /** Resolved category (settings.json, falling back to plugin.json) - see
   * pluginDiscovery.ts's PluginDiscoveryEntry. Used by Sidebar.tsx grouping. */
  category: string;
}

export interface StatusLogEntry {
  id: number;
  timestamp: number;
  level: StatusColor;
  message: string;
  pluginId?: string;
}

export interface ModalRequest {
  id: number;
  kind: "error" | "info" | "question" | "confirm";
  title: string;
  message: string;
  buttons?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ToastEntry {
  id: number;
  title?: string;
  message: string;
  kind: StatusColor;
  durationMs: number;
}

const MAX_LOG_ENTRIES = 500; // bounded ring buffer - logging is also persisted
// to a rolling app-data file separately; this is just the in-memory
// scrollback for StatusBar.

let nextLogId = 1;

interface AppState {
  plugins: Record<string, PluginSidebarEntry>;
  activePluginId: string | null;
  statusLog: StatusLogEntry[];
  categoriesExpanded: Record<string, boolean>;
  categories: CategoryDef[];
  categoryIconFiles: CategoryIconFile[];
  /** Plugin ids in sidebar display order (within their resolved category) -
   * persisted via hostSettings. Ids not present here sort after everything
   * listed. */
  pluginOrder: string[];
  hiddenPaletteIds: string[];
  paletteId: string;
  customPalettes: NamedPalette[];
  taskbarBadgeThreshold: TaskbarBadgeThreshold;
  hostSettingsLoaded: boolean;
  /** Derived from paletteId/customPalettes - recomputed explicitly by every
   * action that touches either, since zustand's default setState merge
   * (Object.assign) would freeze a getter's value instead of keeping it
   * live. Always resolves to a real Palette, never undefined - falls back
   * to premadePalettes[0] (Dark) if paletteId matches nothing. */
  palette: Palette;
  modalQueue: ModalRequest[];
  toasts: ToastEntry[];
  /** Ids of toasts mid fade-out (still rendered, opacity transitioning to 0
   * via CSS) - separate from removal so ToastContainer can animate before
   * `dismissToast` actually drops the entry. */
  fadingToastIds: number[];
  sidebarCollapsed: boolean;
  view: "plugin" | "settings";
  /** Sub-items a plugin has registered via api.sidebar.setItems, keyed by
   * plugin id - see host/api/sidebar.ts. Not persisted; rebuilt each
   * activation, same as `plugins[id].status`. */
  sidebarItemsByPlugin: Record<string, SidebarItem[]>;
  sidebarSelectedByPlugin: Record<string, string | null>;
  /** Whether a plugin's sub-items are expanded - toggled only by clicking the
   * plugin's own row while it's already the active selection; missing = expanded. */
  sidebarSubItemsExpanded: Record<string, boolean>;

  setPlugins(plugins: PluginSidebarEntry[]): void;
  setActivePlugin(id: string | null): void;
  setPluginStatus(id: string, status: StatusColor, tooltip?: string): void;
  logMessage(level: StatusColor, message: string, pluginId?: string): void;
  toggleCategory(category: string): void;
  pushModal(request: ModalRequest): void;
  dismissModal(id: number): void;
  pushToast(entry: ToastEntry): void;
  fadeToast(id: number): void;
  dismissToast(id: number): void;
  toggleSidebarCollapsed(): void;
  openSettings(): void;
  hydrateHostSettings(): Promise<void>;
  loadCategoryIcons(): Promise<void>;
  setCategories(categories: CategoryDef[]): void;
  addCategory(category: CategoryDef): void;
  updateCategory(id: string, updates: Partial<Pick<CategoryDef, "name" | "icon">>): void;
  removeCategory(id: string): void;
  /** Reorders `draggedId` to just before `beforeId` (or to the end of the
   * list when `beforeId` is null) and, if `targetCategoryId` differs from its
   * current resolved category, updates it locally too - callers are
   * responsible for persisting the category change to the plugin's own
   * settings.json (see pluginDiscovery.ts's setPluginCategoryFile) using the
   * returned `dir`. */
  movePlugin(
    draggedId: string,
    targetCategoryId: string,
    beforeId: string | null,
  ): { categoryChanged: boolean; dir: string };
  setPaletteId(id: string): void;
  saveCustomPalette(palette: NamedPalette): void;
  deleteCustomPalette(id: string): void;
  hidePalette(id: string): void;
  setTaskbarBadgeThreshold(threshold: TaskbarBadgeThreshold): void;
  setSidebarItems(pluginId: string, items: SidebarItem[]): void;
  setSidebarSelected(pluginId: string, id: string | null): void;
  clearSidebarItems(pluginId: string): void;
  toggleSidebarSubItemsExpanded(pluginId: string): void;
}

export function resolvePalette(paletteId: string, customPalettes: NamedPalette[]): Palette {
  const found =
    customPalettes.find((p) => p.id === paletteId) ?? premadePalettes.find((p) => p.id === paletteId);
  return (found ?? premadePalettes[0]).colors;
}

export const useAppStore = create<AppState>((set) => ({
  plugins: {},
  activePluginId: null,
  statusLog: [],
  categoriesExpanded: {},
  categories: DEFAULT_CATEGORIES,
  categoryIconFiles: [],
  pluginOrder: [],
  paletteId: premadePalettes[0].id,
  customPalettes: [],
  hiddenPaletteIds: [],
  taskbarBadgeThreshold: "warning",
  hostSettingsLoaded: false,
  palette: resolvePalette(premadePalettes[0].id, []),
  modalQueue: [],
  toasts: [],
  fadingToastIds: [],
  sidebarCollapsed: false,
  view: "plugin",
  sidebarItemsByPlugin: {},
  sidebarSelectedByPlugin: {},
  sidebarSubItemsExpanded: {},

  setPlugins: (plugins) =>
    set((state) => {
      const next: Record<string, PluginSidebarEntry> = {};
      for (const p of plugins) {
        next[p.manifest.id] = {
          manifest: p.manifest,
          status: state.plugins[p.manifest.id]?.status ?? "idle",
          dir: p.dir,
          category: p.category,
        };
      }
      return { plugins: next };
    }),

  setActivePlugin: (id) => set({ activePluginId: id, view: "plugin" }),

  setPluginStatus: (id, status, tooltip) =>
    set((state) => {
      const existing = state.plugins[id];
      if (!existing) return {};
      return { plugins: { ...state.plugins, [id]: { ...existing, status, statusTooltip: tooltip } } };
    }),

  logMessage: (level, message, pluginId) =>
    set((state) => {
      const entry: StatusLogEntry = { id: nextLogId++, timestamp: Date.now(), level, message, pluginId };
      const log = [...state.statusLog, entry];
      if (log.length > MAX_LOG_ENTRIES) log.shift();
      return { statusLog: log };
    }),

  toggleCategory: (category) =>
    set((state) => ({
      categoriesExpanded: { ...state.categoriesExpanded, [category]: !(state.categoriesExpanded[category] ?? true) },
    })),

  pushModal: (request) => set((state) => ({ modalQueue: [...state.modalQueue, request] })),
  dismissModal: (id) => set((state) => ({ modalQueue: state.modalQueue.filter((m) => m.id !== id) })),

  pushToast: (entry) => set((state) => ({ toasts: [...state.toasts, entry] })),
  fadeToast: (id) =>
    set((state) => (state.fadingToastIds.includes(id) ? state : { fadingToastIds: [...state.fadingToastIds, id] })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
      fadingToastIds: state.fadingToastIds.filter((i) => i !== id),
    })),

  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  openSettings: () => set({ view: "settings" }),

  hydrateHostSettings: async () => {
    const loaded = await loadHostSettings();
    set((state) => {
      const categories = loaded.categories ?? state.categories;
      const pluginOrder = loaded.pluginOrder ?? state.pluginOrder;
      const paletteId = loaded.paletteId ?? state.paletteId;
      const customPalettes = loaded.customPalettes ?? state.customPalettes;
      const hiddenPaletteIds = loaded.hiddenPaletteIds ?? state.hiddenPaletteIds;
      const taskbarBadgeThreshold = loaded.taskbarBadgeThreshold ?? state.taskbarBadgeThreshold;
      return {
        categories,
        pluginOrder,
        paletteId,
        customPalettes,
        hiddenPaletteIds,
        taskbarBadgeThreshold,
        hostSettingsLoaded: true,
        palette: resolvePalette(paletteId, customPalettes),
      };
    });
  },

  loadCategoryIcons: async () => {
    try {
      const categoryIconFiles = await listCategoryIcons();
      set({ categoryIconFiles });
    } catch (err) {
      console.error("[appStore] failed to load category icons", err);
    }
  },

  setCategories: (categories) => {
    set({ categories });
    saveHostSettings({ categories });
  },

  addCategory: (category) =>
    set((state) => {
      const categories = [...state.categories, category];
      saveHostSettings({ categories });
      return { categories };
    }),

  updateCategory: (id, updates) =>
    set((state) => {
      if (id === OTHER_CATEGORY_ID) return {};
      const categories = state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c));
      saveHostSettings({ categories });
      return { categories };
    }),

  removeCategory: (id) =>
    set((state) => {
      if (id === OTHER_CATEGORY_ID) return {};
      const categories = state.categories.filter((c) => c.id !== id);
      saveHostSettings({ categories });
      return { categories };
    }),

  movePlugin: (draggedId, targetCategoryId, beforeId) => {
    let categoryChanged = false;
    let dir = "";
    set((state) => {
      const allIds = Object.keys(state.plugins);
      const order = state.pluginOrder.filter((id) => allIds.includes(id));
      for (const id of allIds) if (!order.includes(id)) order.push(id);
      const withoutDragged = order.filter((id) => id !== draggedId);
      const insertAt = beforeId ? withoutDragged.indexOf(beforeId) : -1;
      withoutDragged.splice(insertAt < 0 ? withoutDragged.length : insertAt, 0, draggedId);
      saveHostSettings({ pluginOrder: withoutDragged });

      const draggedEntry = state.plugins[draggedId];
      let plugins = state.plugins;
      if (draggedEntry && draggedEntry.category !== targetCategoryId) {
        categoryChanged = true;
        dir = draggedEntry.dir;
        plugins = { ...state.plugins, [draggedId]: { ...draggedEntry, category: targetCategoryId } };
      }
      return { pluginOrder: withoutDragged, plugins };
    });
    return { categoryChanged, dir };
  },

  setPaletteId: (id) =>
    set((state) => {
      const palette = resolvePalette(id, state.customPalettes);
      saveHostSettings({ paletteId: id });
      return { paletteId: id, palette };
    }),

  saveCustomPalette: (namedPalette) =>
    set((state) => {
      const existingIndex = state.customPalettes.findIndex((p) => p.id === namedPalette.id);
      const customPalettes =
        existingIndex >= 0
          ? state.customPalettes.map((p, i) => (i === existingIndex ? namedPalette : p))
          : [...state.customPalettes, namedPalette];
      const hiddenPaletteIds = state.hiddenPaletteIds.filter((id) => id !== namedPalette.id);
      saveHostSettings({ customPalettes, hiddenPaletteIds });
      return { customPalettes, hiddenPaletteIds, palette: resolvePalette(state.paletteId, customPalettes) };
    }),

  deleteCustomPalette: (id) =>
    set((state) => {
      const customPalettes = state.customPalettes.filter((p) => p.id !== id);
      const paletteId = state.paletteId === id ? premadePalettes[0].id : state.paletteId;
      saveHostSettings({ customPalettes, paletteId });
      return { customPalettes, paletteId, palette: resolvePalette(paletteId, customPalettes) };
    }),

  hidePalette: (id) =>
    set((state) => {
      if (state.hiddenPaletteIds.includes(id)) return {};
      const hiddenPaletteIds = [...state.hiddenPaletteIds, id];
      const paletteId = state.paletteId === id ? premadePalettes[0].id : state.paletteId;
      saveHostSettings({ hiddenPaletteIds, paletteId });
      return { hiddenPaletteIds, paletteId, palette: resolvePalette(paletteId, state.customPalettes) };
    }),

  setTaskbarBadgeThreshold: (threshold) => {
    set({ taskbarBadgeThreshold: threshold });
    saveHostSettings({ taskbarBadgeThreshold: threshold });
  },

  setSidebarItems: (pluginId, items) =>
    set((state) => ({
      sidebarItemsByPlugin: { ...state.sidebarItemsByPlugin, [pluginId]: items.length ? items : EMPTY_SIDEBAR_ITEMS },
    })),

  setSidebarSelected: (pluginId, id) =>
    set((state) => ({ sidebarSelectedByPlugin: { ...state.sidebarSelectedByPlugin, [pluginId]: id } })),

  clearSidebarItems: (pluginId) =>
    set((state) => {
      if (!(pluginId in state.sidebarItemsByPlugin) && !(pluginId in state.sidebarSelectedByPlugin)) return {};
      const sidebarItemsByPlugin = { ...state.sidebarItemsByPlugin };
      const sidebarSelectedByPlugin = { ...state.sidebarSelectedByPlugin };
      delete sidebarItemsByPlugin[pluginId];
      delete sidebarSelectedByPlugin[pluginId];
      return { sidebarItemsByPlugin, sidebarSelectedByPlugin };
    }),

  toggleSidebarSubItemsExpanded: (pluginId) =>
    set((state) => ({
      sidebarSubItemsExpanded: {
        ...state.sidebarSubItemsExpanded,
        [pluginId]: !(state.sidebarSubItemsExpanded[pluginId] ?? true),
      },
    })),
}));
