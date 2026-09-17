import { create } from "zustand";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";
import type { Palette, StatusColor } from "../../shared/palette";
import { defaultPalette } from "../../shared/palette";

export interface PluginSidebarEntry {
  manifest: PluginManifest;
  status: StatusColor;
  statusTooltip?: string;
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
}

export const useAppStore = create<AppState>((set) => ({
  plugins: {},
  activePluginId: null,
  statusLog: [],
  categoriesExpanded: {},
  palette: defaultPalette,
  modalQueue: [],
  toasts: [],
  sidebarCollapsed: false,
  view: "plugin",

  setPlugins: (plugins) =>
    set((state) => {
      const next: Record<string, PluginSidebarEntry> = {};
      for (const p of plugins) {
        next[p.manifest.id] = { manifest: p.manifest, status: state.plugins[p.manifest.id]?.status ?? "idle" };
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
}));
