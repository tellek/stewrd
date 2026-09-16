// Minimal plugin contract for Milestone 2b (discovery + Blob-URL loading +
// hot reload + boot safety). The full PluginApi surface (theme/modal/toast/
// shell/storage/fs/log/tick) lands in Milestone 4 - PluginContext below will
// grow an `api`, `tick`, and `signal` field at that point.
import type { ComponentType } from "react";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  icon: string;
  entry: string;
  description: string;
  apiVersion: string;
  background: boolean;
}

export interface PluginContext {
  pluginId: string;
}

export interface PluginModule {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  Component: ComponentType<{ api?: unknown }>;
}
