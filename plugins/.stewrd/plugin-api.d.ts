// Ambient types for plugin authoring - editor type-checking ONLY. Plugins get
// no npm/module resolution to the host's TS source at runtime; the real
// `api` object is a plain JS argument passed into activate()/Component. This
// file is a standalone flat copy of src/shared/plugin-api.d.ts's public
// shape (no cross-directory imports, so it works from any plugin folder) -
// keep it in sync by hand if the host's PluginApi shape changes; there is
// exactly one author (Topher) so a generator isn't worth the complexity yet.
declare module "stewrd-plugin-api" {
  import type { ComponentType } from "react";

  export type StatusColor = "idle" | "in-progress" | "success" | "warning" | "error";

  export interface Palette {
    background: string;
    surface: string;
    surfaceHover: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
    status: Record<StatusColor, string>;
  }

  export interface TickHandle {
    register(fn: () => void | Promise<void>): void;
    unregister(): void;
    requestWake(afterMs?: number): void;
    setInterval(ms: number | null): void;
  }

  export interface TextBoxProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    rows?: number;
  }

  export interface PluginApi {
    theme: { readonly palette: Palette; subscribe(fn: (p: Palette) => void): () => void };
    statusIcon: { set(color: StatusColor, tooltip?: string): void; get(): StatusColor };
    modal: {
      error(opts: { title: string; message: string }): Promise<void>;
      info(opts: { title: string; message: string }): Promise<void>;
      question(opts: { title: string; message: string; buttons: string[] }): Promise<string>;
      confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>;
    };
    toast: { show(opts: { message: string; kind?: StatusColor; durationMs?: number }): void };
    ui: { TextBox: ComponentType<TextBoxProps>; StatusDot: ComponentType<{ color: StatusColor }> };
    shell: {
      exec(
        cmd: string,
        args: string[],
        opts?: { cwd?: string; env?: Record<string, string> },
      ): Promise<{ code: number; stdout: string; stderr: string }>;
      spawn(
        cmd: string,
        args: string[],
        opts?: {
          cwd?: string;
          env?: Record<string, string>;
          onStdout?: (chunk: string) => void;
          onStderr?: (chunk: string) => void;
        },
      ): { pid: number; kill(): void; done: Promise<{ code: number }> };
    };
    storage: {
      get<T>(key: string): Promise<T | undefined>;
      set<T>(key: string, value: T): Promise<void>;
      getAll<T extends Record<string, unknown>>(): Promise<T>;
    };
    fs: {
      readTextFile(path: string): Promise<string>;
      writeTextFile(path: string, contents: string): Promise<void>;
      watchFile(path: string, onChange: () => void): () => void;
    };
    log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  }

  export interface PluginContext {
    api: PluginApi;
    tick: TickHandle;
    pluginId: string;
    signal: AbortSignal;
    onDispose(fn: () => void): void;
  }

  export interface PluginModule {
    activate(ctx: PluginContext): void | Promise<void>;
    deactivate?(): void | Promise<void>;
    Component: ComponentType<{ api: PluginApi }>;
  }
}
