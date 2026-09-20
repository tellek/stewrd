import { create } from "zustand";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";
import type { NamedPalette, Palette, StatusColor } from "../../shared/palette";
import { premadePalettes } from "../../shared/palette";
import type { CategoryDef } from "../../shared/category";
import { DEFAULT_CATEGORIES, LAYOUTS_CATEGORY_ID, OTHER_CATEGORY_ID } from "../../shared/category";
import { loadHostSettings, saveHostSettings, type SavedLayout, type TaskbarBadgeThreshold } from "./hostSettings";
import { listCategoryIcons, type CategoryIconFile } from "../api/categoryIcons";
import type { SidebarItem } from "../../shared/plugin-api.d.ts";
import {
  closeLeafInTree,
  countLeaves,
  createLeaf,
  findLeafForPlugin,
  firstLeafId,
  resizeSplitInTree,
  setPluginInTree,
  splitLeafInTree,
  type PaneEdge,
  type PaneNode,
} from "./paneTree";

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
  kind: "error" | "info" | "question" | "confirm" | "prompt";
  title: string;
  message: string;
  buttons?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** "prompt" only - see host/api/modals.ts's promptModal. */
  maxLength?: number;
  initialValue?: string;
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
  /** Session-only pane layout (not persisted) - see paneTree.ts. Replaces the
   * old single-tool `activePluginId` concept. */
  paneTree: PaneNode;
  /** Id of the pane last clicked/focused - a sidebar click/center-drop
   * targets this pane, and it renders an accent-color outline. */
  activePaneId: string;
  /** Named, explicitly-saved pane arrangements - persisted via hostSettings.
   * Surfaced as the sidebar's Layouts section once non-empty or once more
   * than one pane is currently open. */
  layouts: SavedLayout[];
  /** Plugin id currently being dragged from the sidebar, if any - set on
   * dragstart/cleared on dragend by SidebarPluginItem.tsx. dataTransfer's
   * payload can't be read during a dragover (only on drop), so pane drop
   * zones read this instead to know, while hovering, whether the dragged
   * plugin already occupies a different pane (v1's one-pane-per-plugin
   * rule) and should show a rejected/no-op cursor rather than a split
   * preview that will do nothing on drop. */
  draggingPluginId: string | null;
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
  /** Persisted (hostSettings) - plugin ids known (from a previous session, or
   * earlier this session) to register sidebar sub-items, so a lazy plugin's
   * disclosure triangle can show before it's activated this session. See
   * hostSettings.ts. */
  pluginsWithSidebarItems: string[];

  setPlugins(plugins: PluginSidebarEntry[]): void;
  setDraggingPlugin(id: string | null): void;
  setActivePane(id: string): void;
  /** Opens `pluginId` in the pane addressed by `paneId` and switches out of
   * Settings. If `pluginId` already occupies a different pane, this only
   * moves focus there (v1 restricts a given plugin to at most one pane) -
   * never a silent no-op, so a click on an already-open tool always at least
   * switches away from Settings and focuses it. */
  setPaneTool(paneId: string, pluginId: string): void;
  /** Splits the pane addressed by `paneId` in `edge`'s direction and opens
   * `pluginId` in the new half - or just moves focus there (see setPaneTool)
   * if `pluginId` already occupies a different pane. */
  splitPane(paneId: string, edge: PaneEdge, pluginId: string): void;
  resizePane(splitId: string, sizes: [number, number]): void;
  /** No-ops if `paneId` is the tree's only pane. */
  closePane(paneId: string): void;
  saveLayout(name: string): void;
  applyLayout(id: string): void;
  deleteLayout(id: string): void;
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

const initialPane = createLeaf();

export const useAppStore = create<AppState>((set, get) => ({
  plugins: {},
  paneTree: initialPane,
  activePaneId: initialPane.id,
  layouts: [],
  draggingPluginId: null,
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
  pluginsWithSidebarItems: [],

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

  setDraggingPlugin: (id) => set({ draggingPluginId: id }),

  setActivePane: (id) => set({ activePaneId: id }),

  setPaneTool: (paneId, pluginId) =>
    set((state) => {
      const elsewhere = findLeafForPlugin(state.paneTree, pluginId);
      if (elsewhere && elsewhere.id !== paneId) {
        return { activePaneId: elsewhere.id, view: "plugin" };
      }
      return { paneTree: setPluginInTree(state.paneTree, paneId, pluginId), activePaneId: paneId, view: "plugin" };
    }),

  splitPane: (paneId, edge, pluginId) =>
    set((state) => {
      const elsewhere = findLeafForPlugin(state.paneTree, pluginId);
      if (elsewhere) {
        return { activePaneId: elsewhere.id, view: "plugin" };
      }
      const paneTree = splitLeafInTree(state.paneTree, paneId, edge, pluginId);
      const newLeaf = findLeafForPlugin(paneTree, pluginId);
      return { paneTree, activePaneId: newLeaf?.id ?? paneId, view: "plugin" };
    }),

  resizePane: (splitId, sizes) =>
    set((state) => ({ paneTree: resizeSplitInTree(state.paneTree, splitId, sizes) })),

  closePane: (paneId) =>
    set((state) => {
      if (countLeaves(state.paneTree) <= 1) return {};
      const paneTree = closeLeafInTree(state.paneTree, paneId);
      if (paneTree === null) return {};
      const activePaneId = state.activePaneId === paneId ? firstLeafId(paneTree) : state.activePaneId;
      return { paneTree, activePaneId };
    }),

  saveLayout: (name) =>
    set((state) => {
      const layout: SavedLayout = { id: crypto.randomUUID(), name, tree: structuredClone(state.paneTree) };
      const layouts = [...state.layouts, layout];
      saveHostSettings({ layouts });
      return { layouts };
    }),

  applyLayout: (id) => {
    const layout = get().layouts.find((l) => l.id === id);
    if (!layout) return;
    const paneTree = structuredClone(layout.tree);
    set({ paneTree, activePaneId: firstLeafId(paneTree), view: "plugin" });
  },

  deleteLayout: (id) =>
    set((state) => {
      const layouts = state.layouts.filter((l) => l.id !== id);
      saveHostSettings({ layouts });
      return { layouts };
    }),

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
    set((state) => {
      const categoriesExpanded = {
        ...state.categoriesExpanded,
        [category]: !(state.categoriesExpanded[category] ?? true),
      };
      saveHostSettings({ categoriesExpanded });
      return { categoriesExpanded };
    }),

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
      // Migration: existing installs' persisted `categories` predate the
      // built-in Layouts category - append it (at the end, user can drag it
      // to reorder) if it's missing, so it still shows up in
      // Settings > Categories after an upgrade instead of only existing for
      // brand-new installs that start from DEFAULT_CATEGORIES.
      const loadedCategories = loaded.categories ?? state.categories;
      const categories = loadedCategories.some((c) => c.id === LAYOUTS_CATEGORY_ID)
        ? loadedCategories
        : [...loadedCategories, { id: LAYOUTS_CATEGORY_ID, name: "Layouts", icon: "diagram" }];
      const pluginOrder = loaded.pluginOrder ?? state.pluginOrder;
      const paletteId = loaded.paletteId ?? state.paletteId;
      const customPalettes = loaded.customPalettes ?? state.customPalettes;
      const hiddenPaletteIds = loaded.hiddenPaletteIds ?? state.hiddenPaletteIds;
      const taskbarBadgeThreshold = loaded.taskbarBadgeThreshold ?? state.taskbarBadgeThreshold;
      const pluginsWithSidebarItems = loaded.pluginsWithSidebarItems ?? state.pluginsWithSidebarItems;
      const sidebarSubItemsExpanded = loaded.sidebarSubItemsExpanded ?? state.sidebarSubItemsExpanded;
      const categoriesExpanded = loaded.categoriesExpanded ?? state.categoriesExpanded;
      const layouts = loaded.layouts ?? state.layouts;
      return {
        categories,
        pluginOrder,
        paletteId,
        customPalettes,
        hiddenPaletteIds,
        categoriesExpanded,
        sidebarSubItemsExpanded,
        taskbarBadgeThreshold,
        pluginsWithSidebarItems,
        layouts,
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
    set((state) => {
      const sidebarItemsByPlugin = {
        ...state.sidebarItemsByPlugin,
        [pluginId]: items.length ? items : EMPTY_SIDEBAR_ITEMS,
      };
      if (items.length === 0 || state.pluginsWithSidebarItems.includes(pluginId)) {
        return { sidebarItemsByPlugin };
      }
      const pluginsWithSidebarItems = [...state.pluginsWithSidebarItems, pluginId];
      saveHostSettings({ pluginsWithSidebarItems });
      return { sidebarItemsByPlugin, pluginsWithSidebarItems };
    }),

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
    set((state) => {
      const sidebarSubItemsExpanded = {
        ...state.sidebarSubItemsExpanded,
        [pluginId]: !(state.sidebarSubItemsExpanded[pluginId] ?? true),
      };
      saveHostSettings({ sidebarSubItemsExpanded });
      return { sidebarSubItemsExpanded };
    }),
}));
