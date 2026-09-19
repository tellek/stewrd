// Full plugin contract (Milestone 4). PluginApi is assembled per-plugin by
// host/api/createPluginApi.ts; the sub-API shapes (ThemeApi, ModalApi, etc.)
// each live next to their implementation under host/api/ and are re-exported
// here so this file stays the single reference for "the author-facing shape".
import type { ComponentType, ReactNode } from "react";
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
  /** Legacy fallback only - the effective version shown by the Settings >
   * Plugins UI comes from `PluginDiscoveryEntry.version` (settings.json's
   * "version" key, falling back to this field if settings.json has none). */
  version?: string;
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
  /** Data URL from api.fs.readDataUrl, or other MaskIcon-compatible source. */
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
  /** 0-100; omit for an indeterminate bar. */
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
  /** Data URL - see plugins/_template/README.md's icon contract. */
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

// --- Overlays ---
// Blanket/Drawer/InlineDialog position themselves against the nearest
// positioned ancestor, which is the plugin's own render container - they
// will not cover the sidebar/status bar.
export interface BlanketProps {
  onClick?: () => void;
  /** Set to `false` to fade the dim out (fixed 1s) instead of removing it
   * outright - defaults to `true` (dimmed/fading in). */
  visible?: boolean;
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right" | "top" | "bottom";
  /** Width (left/right) or height (top/bottom) of the drawer, in px. */
  size?: number;
  /** Slide transition duration, in ms. */
  durationMs?: number;
  title?: string;
  children?: ReactNode;
}

export interface InlineDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fade/scale transition duration, in ms. */
  durationMs?: number;
  title?: string;
  message?: string;
  children?: ReactNode;
}

// --- Messaging ---
export interface BannerProps {
  message: string;
  /** Palette token, not a raw color - drives the banner's color. */
  tone?: StatusColor | "accent" | "surface";
  /** `"outline"` (default): `palette.surface` background, tone-colored
   * border/icon/text. `"solid"`: tone-colored background with a legible
   * (contrastText) foreground. */
  variant?: "outline" | "solid";
  /** Optional data URL (see api.fs.readDataUrl) - no auto-derived default. */
  icon?: string;
  onDismiss?: () => void;
  /** If set, the banner fades itself out (1s) after this many ms, then calls
   * `onDismiss`. */
  autoDismissMs?: number;
}

export interface PluginApi {
  theme: ThemeApi;
  statusIcon: StatusIconApi;
  modal: ModalApi;
  toast: ToastApi;
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
