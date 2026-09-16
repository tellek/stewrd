import { create } from "zustand";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";
import type { Palette, StatusColor } from "../../shared/palette";
import { defaultPalette } from "../../shared/palette";

export interface PluginSidebarEntry {
  manifest: PluginManifest;
  status: StatusColor;
}

export interface StatusLogEntry {
  id: number;
  timestamp: number;
  level: StatusColor;
  message: string;
  pluginId?: string;
}

const MAX_LOG_ENTRIES = 500; // bounded ring buffer - logging is also persisted
// to a rolling app-data file separately (Milestone 4); this is just the
// in-memory scrollback for StatusBar.

let nextLogId = 1;

interface AppState {
  plugins: Record<string, PluginSidebarEntry>;
  activePluginId: string | null;
  statusLog: StatusLogEntry[];
  categoriesExpanded: Record<string, boolean>;
  palette: Palette;

  setPlugins(plugins: PluginSidebarEntry[]): void;
  setActivePlugin(id: string | null): void;
  setPluginStatus(id: string, status: StatusColor): void;
  logMessage(level: StatusColor, message: string, pluginId?: string): void;
  toggleCategory(category: string): void;
}

export const useAppStore = create<AppState>((set) => ({
  plugins: {},
  activePluginId: null,
  statusLog: [],
  categoriesExpanded: {},
  palette: defaultPalette,

  setPlugins: (plugins) =>
    set((state) => {
      const next: Record<string, PluginSidebarEntry> = {};
      for (const p of plugins) {
        next[p.manifest.id] = { manifest: p.manifest, status: state.plugins[p.manifest.id]?.status ?? "idle" };
      }
      return { plugins: next };
    }),

  setActivePlugin: (id) => set({ activePluginId: id }),

  setPluginStatus: (id, status) =>
    set((state) => {
      const existing = state.plugins[id];
      if (!existing) return {};
      return { plugins: { ...state.plugins, [id]: { ...existing, status } } };
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
}));
