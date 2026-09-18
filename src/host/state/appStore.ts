import { create } from "zustand";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";
import type { NamedPalette, Palette, StatusColor } from "../../shared/palette";
import { premadePalettes } from "../../shared/palette";
import type { CategoryDef } from "../../shared/category";
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_ID } from "../../shared/category";
import { loadHostSettings, saveHostSettings, type TaskbarBadgeThreshold } from "./hostSettings";
import { listCategoryIcons, type CategoryIconFile } from "../api/categoryIcons";

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
  sidebarCollapsed: boolean;
  view: "plugin" | "settings";

  setPlugins(plugins: PluginSidebarEntry[]): void;
  setActivePlugin(id: string | null): void;
  setPluginStatus(id: string, status: StatusColor, tooltip?: string): void;
  logMessage(level: StatusColor, message: string, pluginId?: string): void;
  toggleCategory(category: string): void;
  pushModal(request: ModalRequest): void;
  dismissModal(id: number): void;
  pushToast(entry: ToastEntry): void;
  dismissToast(id: number): void;
  toggleSidebarCollapsed(): void;
  openSettings(): void;
  hydrateHostSettings(): Promise<void>;
  loadCategoryIcons(): Promise<void>;
  setCategories(categories: CategoryDef[]): void;
  addCategory(category: CategoryDef): void;
  updateCategory(id: string, updates: Partial<Pick<CategoryDef, "name" | "icon">>): void;
  removeCategory(id: string): void;
  setPaletteId(id: string): void;
  saveCustomPalette(palette: NamedPalette): void;
  deleteCustomPalette(id: string): void;
  hidePalette(id: string): void;
  setTaskbarBadgeThreshold(threshold: TaskbarBadgeThreshold): void;
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
  paletteId: premadePalettes[0].id,
  customPalettes: [],
  hiddenPaletteIds: [],
  taskbarBadgeThreshold: "warning",
  hostSettingsLoaded: false,
  palette: resolvePalette(premadePalettes[0].id, []),
  modalQueue: [],
  toasts: [],
  sidebarCollapsed: false,
  view: "plugin",

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
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  openSettings: () => set({ view: "settings" }),

  hydrateHostSettings: async () => {
    const loaded = await loadHostSettings();
    set((state) => {
      const categories = loaded.categories ?? state.categories;
      const paletteId = loaded.paletteId ?? state.paletteId;
      const customPalettes = loaded.customPalettes ?? state.customPalettes;
      const hiddenPaletteIds = loaded.hiddenPaletteIds ?? state.hiddenPaletteIds;
      const taskbarBadgeThreshold = loaded.taskbarBadgeThreshold ?? state.taskbarBadgeThreshold;
      return {
        categories,
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
}));
