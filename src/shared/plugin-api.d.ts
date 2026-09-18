// Full plugin contract (Milestone 4). PluginApi is assembled per-plugin by
// host/api/createPluginApi.ts; the sub-API shapes (ThemeApi, ModalApi, etc.)
// each live next to their implementation under host/api/ and are re-exported
// here so this file stays the single reference for "the author-facing shape".
import type { ComponentType } from "react";
import type { StatusColor } from "./palette";
import type { TickHandle } from "../host/scheduler/tickScheduler";
import type { ThemeApi } from "../host/api/theme";
import type { StatusIconApi } from "../host/api/statusIcon";
import type { ModalApi } from "../host/api/modals";
import type { ToastApi } from "../host/api/toast";
import type { ShellApi } from "../host/api/shell";
import type { StorageApi } from "../host/api/storage";
import type { FsApi } from "../host/api/fs";
import type { LogApi } from "../host/api/logging";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Legacy fallback only - the effective category shown by the Settings >
   * Plugins UI comes from `PluginDiscoveryEntry.category` (settings.json's
   * "category" key, falling back to this field if settings.json has none). */
  category?: string;
  icon: string;
  entry: string;
  description: string;
  apiVersion: string;
  background: boolean;
}

export interface TextBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
}

export interface PluginApi {
  theme: ThemeApi;
  statusIcon: StatusIconApi;
  modal: ModalApi;
  toast: ToastApi;
  ui: { TextBox: ComponentType<TextBoxProps>; StatusDot: ComponentType<{ color: StatusColor }> };
  shell: ShellApi;
  storage: StorageApi;
  fs: FsApi;
  log: LogApi;
}

export interface PluginContext {
  api: PluginApi;
  tick: TickHandle;
  pluginId: string;
  /** Aborted by the host on deactivate, so async work can opt into real
   * cancellation (e.g. pass into fetch()/long-running loops) instead of
   * relying only on manual isActive-flag checks. */
  signal: AbortSignal;
  /** Disposal bag for anything registered outside the tracked APIs (raw DOM
   * listeners, extra timers, fs watchers). Only ctx.tick and ctx.signal are
   * actually auto-revoked by the host on deactivate - spawned processes
   * (api.shell.spawn) and anything else created through the other api.*
   * surfaces are NOT auto-cleaned-up; register their teardown here yourself
   * (e.g. onDispose(() => child.kill())). */
  onDispose(fn: () => void): void;
}

export interface PluginModule {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  Component: ComponentType<{ api: PluginApi }>;
}
