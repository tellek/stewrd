// Ambient types for plugin authoring - editor type-checking ONLY. Plugins get
// no npm/module resolution to the host's TS source at runtime; the real
// `api` object is a plain JS argument passed into activate()/Component. This
// file is a standalone flat copy of src/shared/plugin-api.d.ts's public
// shape (no cross-directory imports, so it works from any plugin folder) -
// keep it in sync by hand if the host's PluginApi shape changes; there is
// exactly one author (Topher) so a generator isn't worth the complexity yet.
declare module "stewrd-plugin-api" {
  import type { ComponentType, ReactNode } from "react";

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

  export interface MaskIconProps {
    png?: string;
    alt: string;
    size?: number;
    color?: string;
  }

  // --- Buttons ---
  export interface TextButtonProps {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
  }

  export interface IconButtonProps {
    icon?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }

  export interface IconTextButtonProps {
    icon?: string;
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
  }

  // --- Selection ---
  export interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }

  export interface RadioGroupProps {
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }

  export interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }

  // --- Loading ---
  export interface SpinnerProps {
    size?: number;
  }

  export interface ProgressBarProps {
    value?: number;
  }

  export interface SkeletonProps {
    width?: number | string;
    height?: number | string;
  }

  // --- Dropdowns ---
  export interface DropdownOption {
    label: string;
    value: string;
  }

  export interface DropdownProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  export interface DropdownCheckboxesProps {
    options: DropdownOption[];
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  export interface DropdownRadioProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  export interface DropdownImageOption extends DropdownOption {
    image?: string;
  }

  export interface DropdownImageTextProps {
    options: DropdownImageOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  export interface DropdownImageGridProps {
    options: DropdownImageOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  // --- Navigation ---
  export interface TabsProps {
    tabs: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
  }

  export interface PaginationProps {
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
  }

  export interface MenuItem {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }

  export interface MenuProps {
    trigger: ReactNode;
    items: MenuItem[];
  }

  export interface LinkProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }

  export interface BlanketProps {
    onClick?: () => void;
    durationMs?: number;
  }

  export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    side?: "left" | "right" | "top" | "bottom";
    size?: number;
    durationMs?: number;
    title?: string;
    children?: ReactNode;
  }

  export interface InlineDialogProps {
    open: boolean;
    onClose: () => void;
    durationMs?: number;
    title?: string;
    message?: string;
    children?: ReactNode;
  }

  export interface BannerProps {
    message: string;
    tone?: StatusColor | "accent" | "surface";
    variant?: "outline" | "solid";
    icon?: string;
    onDismiss?: () => void;
    autoDismissMs?: number;
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
    toast: { show(opts: { title?: string; message: string; kind?: StatusColor; durationMs?: number }): void };
    ui: {
      TextBox: ComponentType<TextBoxProps>;
      StatusDot: ComponentType<{ color: StatusColor }>;
      MaskIcon: ComponentType<MaskIconProps>;
      TextButton: ComponentType<TextButtonProps>;
      IconButton: ComponentType<IconButtonProps>;
      IconTextButton: ComponentType<IconTextButtonProps>;
      Checkbox: ComponentType<CheckboxProps>;
      RadioGroup: ComponentType<RadioGroupProps>;
      Toggle: ComponentType<ToggleProps>;
      Spinner: ComponentType<SpinnerProps>;
      ProgressBar: ComponentType<ProgressBarProps>;
      Skeleton: ComponentType<SkeletonProps>;
      Dropdown: ComponentType<DropdownProps>;
      DropdownCheckboxes: ComponentType<DropdownCheckboxesProps>;
      DropdownRadio: ComponentType<DropdownRadioProps>;
      DropdownImageText: ComponentType<DropdownImageTextProps>;
      DropdownImageGrid: ComponentType<DropdownImageGridProps>;
      Tabs: ComponentType<TabsProps>;
      Pagination: ComponentType<PaginationProps>;
      Menu: ComponentType<MenuProps>;
      Link: ComponentType<LinkProps>;
      Blanket: ComponentType<BlanketProps>;
      Drawer: ComponentType<DrawerProps>;
      InlineDialog: ComponentType<InlineDialogProps>;
      Banner: ComponentType<BannerProps>;
    };
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
      readDataUrl(path: string): Promise<string>;
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
