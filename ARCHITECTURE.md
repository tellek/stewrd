# Stewrd — Architecture

Full internals reference for Stewrd, kept in sync with the code — see [README.md](README.md) for the short human-facing overview.

> **Maintenance note for future readers (human or AI):** `CLAUDE.md` at the repo root points here as a good source of detail before starting work. This file is meant to be updated incrementally — when you add/change a host API, a Rust command, or a major mechanism, update the relevant section below in the same commit. Don't let this drift from the code; when in doubt, the source files linked in each section are the ground truth and this doc should be corrected to match them, not the other way around. Every claim below was verified against the source as of this writing — if you find one that no longer matches, fix it rather than assuming it's still close enough.

---

## 1. Orientation — where things live

```
stewrd/
  README.md                   short, human-facing overview (what it is, how to use it, how to create plugins)
  ARCHITECTURE.md             this file — full internals reference
  index.html                 host page shell; the generated <script type="importmap"> (see §5) is injected here
  src-tauri/
    tauri.conf.json           app identifier ("com.topher.stewrd", required by Tauri for packaging/signing — not used to derive any storage path, see §3)
    capabilities/              Tauri 2 ACL config — stays minimal; the plugin-facing shell/fs/storage commands are custom app commands, not official plugins, so they need no capability entries (see §8)
    src/
      main.rs                  entry point, calls stewrd_lib::run()
      lib.rs                   app builder, command registration, exit-time child-process cleanup
      state.rs                 AppState: plugin fs-watcher handle, tracked child pids/kill-senders
      commands/
        mod.rs                  re-exports the command modules below
        plugins.rs               plugin discovery, boot-safety marks, disabled-plugin list, safe mode
        shell.rs                 run_command / spawn_command / kill_command
        storage.rs               per-plugin JSON key/value store (atomic writes)
        fs.rs                    per-plugin scoped raw file read/write (atomic writes)
        interval.rs              Rust-side tokio::interval heartbeat (survives window minimize)
        watcher.rs                fs watcher over the plugins dir -> "plugin-changed" events
        logging.rs                rolling persistent log file (<exe-dir>/stewrd.log)
  src/                        React + TS host shell
    main.tsx                   React entry point
    host/
      layout/                  Sidebar, SidebarCategory, SidebarCategoryCollapsed, SidebarPluginItem, SidebarLayouts, SidebarLayoutsCollapsed, SidebarFooter, SettingsPage, categoryIcons, MainContent, StatusBar, StatusIcon
      loader/                  pluginDiscovery.ts, pluginLoader.ts, usePluginRegistry.ts
      scheduler/               tickScheduler.ts (+ its own unit tests)
      api/                     one file per PluginApi sub-surface (theme/modals/toast/shell/storage/fs/logging/statusIcon/sidebar) + createPluginApi.ts which assembles them
      state/                   appStore.ts (zustand: plugins, paneTree/activePaneId/layouts/draggingPluginId (see §1a), statusLog, modals, toasts, categories, paletteId, customPalettes, palette (derived), sidebarCollapsed, sidebarItemsByPlugin, sidebarSelectedByPlugin, sidebarSubItemsExpanded, pluginsWithSidebarItems, view), paneTree.ts (pure PaneNode split-tree helpers), hostSettings.ts (persists categories/theme/pluginsWithSidebarItems/sidebarSubItemsExpanded/layouts via storage_get/set under a reserved "__host__" id)
      errors/                  PluginErrorBoundary.tsx, globalErrorHandlers.ts
      vendor-entries/          facade files used only to produce import-map targets for react/react-dom/tauri-api (see §5)
    shared/
      plugin-api.d.ts          the canonical PluginApi/PluginManifest/PluginContext/PluginModule TypeScript shape
      palette.ts               Palette + StatusColor + NamedPalette types, defaultPalette, premadePalettes (Dark/Light)
      category.ts              CategoryDef type, DEFAULT_CATEGORIES, resolveCategory (falls back to "Other")
    components/                Modal/, Toast/ — host-rendered singletons driven by api.modal/api.toast (not exposed as components); the full palette-driven `api.ui` component library (TextBox, StatusDot, MaskIcon, TextButton, IconButton, IconTextButton, Checkbox, RadioGroup, Toggle, Spinner, ProgressBar, Skeleton, Dropdown, DropdownCheckboxes, DropdownRadio, DropdownImageText, DropdownImageGrid, Tabs, Pagination, Menu, Link, Blanket, Drawer, InlineDialog, Banner, RangeSlider, Calendar, DatePicker, TimePicker, DateTimePicker, CodeTextArea — see plugins/_template/README.md for the full coverage table); shared/ — internal styles.ts/usePopover.ts helpers, not exposed to plugins
  plugins/                   plugin source (dev-time location — see §3 "where plugins actually live at runtime")
    CLAUDE.md                 ships to every install's plugins/ folder (see §3 "Starting a new plugin") — condensed, self-contained plugin-authoring reference for an AI assistant working against a real install (no repo clone)
    build-plugin.mjs           standalone esbuild wrapper shipped alongside CLAUDE.md above — same config as scripts/stewrd-plugin-build.mjs, usable from just <install>/plugins/ with a local `npm install esbuild`
    .stewrd/plugin-api.d.ts   hand-maintained flat copy of shared/plugin-api.d.ts as an ambient `declare module "stewrd-plugin-api"` for plugin-author editor type-checking only (not used at runtime); also shipped to installs (see §3)
    _template/                starter plugin — copy this folder to build a new plugin; demonstrates every API surface; has its own README.md (claude.md expects every plugin folder to have one — only _template does today); its source (index.tsx/demos/README.md/assets, not just dist/) ships to installs too (see §3, §9a)
    notepad/                  single autosaving markdown note: custom in-plugin CodeMirror editor (source/live-preview/reading modes), Obsidian-style syntax (callouts/checklists/footnotes/frontmatter), settings.json-only config, background: true LLM-wiki harvester
    claude-settings-editor/   edits ~/.claude/settings.json via shell (deliberately bypasses api.fs — see plugin's own comments); Windows-only (PowerShell)
    git-tracker/              background: true; polls a repo via Rust interval + JS tick; spawns `claude` headless
  scripts/
    stewrd-plugin-build.mjs           shared esbuild wrapper every plugin's build step calls (`npm run plugin:build -- <dir> [--watch]`)
    vite-plugin-react-importmap.ts    generates the host's <script type="importmap"> (see §5)
  docs/architecture-plan.md   the original design doc — much more verbose rationale/history than this file, including two rejected designs for plugin loading with reasons, and some *intended* behavior that never got implemented (this ARCHITECTURE.md calls those out explicitly where they matter — see §11)
  claude.md                   repo-root Claude instructions: commit+push directly to main when done, load ARCHITECTURE.md for detail, each plugin folder should have its own README.md
```

---

## 1a. Main-area panes and saved layouts

The main area is a binary split-tree (`PaneNode` in `host/state/paneTree.ts`: a `leaf` holds one plugin id or none, a `split` holds two children plus `row`/`column` direction and `[size, size]` percentages), rendered recursively by `MainContent.tsx`'s `PaneView`. `appStore.paneTree`/`activePaneId` are session-only (not persisted) - the active pane gets an accent-color outline and is what a sidebar click (`setPaneTool`) replaces. Dragging a sidebar plugin onto a pane's left/right edge splits it side-by-side (`direction: "row"`); top/bottom splits it stacked (`direction: "column"`); dropping in the center replaces that pane's tool. Dividers are hand-rolled (pointer events + flex-basis percentages, clamped to a minimum size) - no split-pane library. **v1 restricts a given plugin to at most one pane at a time** (its `api.sidebar` state is keyed per-plugin-id, not per-pane) - opening/dragging a plugin that's already open elsewhere just moves focus to its existing pane instead of duplicating it.

Named layouts (`SavedLayout { id, name, tree }`, `appStore.layouts`) persist a snapshot of `paneTree` via `hostSettings.ts`'s `layouts` field. The sidebar's Layouts section (`SidebarLayouts.tsx`/`SidebarLayoutsCollapsed.tsx`) appears once a layout exists or more than one pane is open, listing saved layouts (click to `applyLayout`) with a "Save" row pinned last that opens a host-only `prompt`-kind modal (`Modal.tsx`, `host/api/modals.ts`'s `promptModal` - not exposed to plugins) asking for a name (max 14 characters).

---

## 2. Mental model in one paragraph

The host discovers plugin folders (each with a `plugin.json` + a prebuilt `dist/index.js`), reads each plugin's built JS as **text** over IPC, wraps it in a `Blob` and `import()`s that Blob URL. Because the Blob URL is same-origin with the host document, a `<script type="importmap">` in `index.html` lets the plugin's bare `import "react"` resolve to the *exact same* React instance the host uses — so plugin components can use hooks and it all behaves like one React tree, even though the plugin was never bundled with the host. Every plugin gets a fresh `PluginContext` (a per-activation `api` object, a tick handle, an `AbortSignal`, and a dispose bag) when it activates. On deactivate the host tears down what it *tracks itself* — the tick handle and the abort signal — and runs the plugin's own `onDispose` callbacks; it does **not** reach into `shell`/`storage`/`fs` and revoke things on the plugin's behalf (see §4), so a plugin that spawns a process or opens a watch is responsible for cleaning it up itself.

---

## 3. How plugins work

### Manifest (`plugin.json`)

```json
{
  "id": "notepad",
  "name": "Notepad",
  "icon": "default",
  "entry": "dist/index.js",
  "description": "Autosaving scratch pad with Claude memory extraction",
  "apiVersion": "1",
  "background": false
}
```

| Field | Meaning |
|---|---|
| `id` | Unique identifier; should match the folder name. Used for storage/fs namespacing, hot-reload matching, boot-safety marks. |
| `name` | Sidebar display name. |
| `version` | **Legacy fallback only** - see `settings.json` below, which is now the primary source. Kept optional on this struct for plugins that predate `settings.json`; a plugin with both wins on the `settings.json` value. |
| `category` | **Legacy fallback only** - see `settings.json` below, which is now the primary source of a plugin's sidebar category. Kept optional on this struct for plugins that predate `settings.json`; a plugin with both wins on the `settings.json` value. |
| `icon` | Unused - reserved. Drop `icon.png` into the plugin's own folder to give it a sidebar icon instead - it's rendered as a CSS mask, tinted to the current theme color. |
| `entry` | Path to the **built** output the loader imports — always `dist/index.js`. You write `index.tsx`; esbuild produces this. |
| `description` | Shown in discovery-error messages/tooling. |
| `apiVersion` | Must equal the host's `SUPPORTED_API_VERSION` (currently `"1"`, see `src-tauri/src/commands/plugins.rs`) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at startup for off-screen work (pollers). `false` (default) = activate lazily on first sidebar selection. |

Validated with `serde` on the Rust side (parse + `apiVersion` equality only) — there is no frontend zod/schema validation in the code despite an earlier plan mentioning one.

A plugin can optionally drop a `settings.json` next to `plugin.json` — a **plain JSON object**, not a schema. The host only reads two keys out of it, `"category"` (sidebar grouping - falls back to the manifest's own `category` field above if absent) and `"version"` (informational, shown in Settings > Plugins - falls back to the manifest's own `version` field above if absent), both resolved via `plugins.rs::resolve_settings_string`; everything else in the file is entirely up to the plugin author and uninterpreted by the host. Users edit it directly via **Settings > Plugins > Configure** — a raw JSON text editor (validated before it's written, mirroring `plugins/claude-settings-editor/index.tsx`'s own settings-file-editing pattern), not a generated form. See `plugins/_template/README.md` for the convention and `plugins/_template/settings.json` for an example. Entirely optional; omit it if there's nothing to configure (Configure still works, offering a starter `{ "category": "" }` object).

### Plugin module contract

A plugin's `dist/index.js` must export:

```ts
interface PluginModule {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  Component: React.ComponentType<{ api: PluginApi }>;
}
```

The host renders `<mod.Component api={...} />` directly inside its own tree — plugins are never mounted as a separate React root.

### Lifecycle

1. **Discover** — Rust `list_plugins` command (`src-tauri/src/commands/plugins.rs`) scans the resolved plugins dir for immediate subfolders. A subfolder with no `plugin.json` is **silently skipped** (not a folder the loader considers at all, not a reported error). Folders that *do* have a `plugin.json` but fail to parse it, have a mismatched `apiVersion`, or are missing the built entry file **do** show up as a discovery error. Note: if the plugins directory itself can't be read (e.g. a bad `STEWRD_PLUGINS` override), `list_plugins` fails entirely and no plugin loads, not just the bad one. A filesystem watcher (`commands/watcher.rs`, `notify-debouncer-full`, 1s debounce) re-triggers discovery on any change under a plugin's folder and emits a fixed `plugin-changed` event whose **payload** is the affected plugin's directory name (not part of the event name itself).
2. **Load** — `background: true` plugins are Blob-URL-imported immediately at startup; everything else is merely listed (so the sidebar shows it) and stays lazy until first placed in a pane (`usePluginRegistry.ensureLoaded`, triggered by `App.tsx` for every plugin id currently occupying a pane in `appStore.paneTree` - see §1a).
3. **Activate** — `activate(ctx)` runs once per load/reload. Register tick handlers and kick off startup work here. Note `statusIcon.set()` calls made here are a silent no-op for an eagerly-activated (`background: true`) plugin whose sidebar entry hasn't been populated into `appStore` yet — see §4.
4. **Mount/Unmount** — pure React, toggled by sidebar selection. Does **not** re-run activate/deactivate; a plugin's component can mount/unmount many times across one activation.
5. **Deactivate** — runs on hot-reload-replace or app shutdown. Order matters and is easy to get backwards: the plugin's own `deactivate()` runs first (fire-and-forget — its return value is **not** awaited, so an async `deactivate()` can still be running when the rest of teardown proceeds), then the host runs everything queued via `ctx.onDispose(fn)`, **then** aborts `ctx.signal`, **then** unregisters the tick handle (`destroyPluginContext` in `createPluginApi.ts`). Don't write an `onDispose` callback that assumes `ctx.signal` is already aborted — it isn't yet.
6. **Uninstall** — delete the folder; the next discovery pass removes and deactivates it if it was active (see hot-remove handling in `usePluginRegistry.ts`).

### Where plugins actually live at runtime

The `plugins/` folder at the repo root is the **dev-time source location** — each subfolder has source + its own `esbuild --watch`. Resolution order (`resolve_plugins_dir` in `commands/plugins.rs`):

1. `STEWRD_PLUGINS` env var (dev convenience — point this at the repo's `plugins/` folder while developing).
2. A `plugins` folder next to the running executable (e.g. `C:\Utilities\stewrd\plugins`). Created automatically if missing.

This app is **portable by design** — there is no per-user app-data fallback tier. Everything the host itself owns — `stewrd.log`, `boot-marks.json`, `disabled-plugins.json`, and the `SAFE_MODE` file (§4) — lives directly in the folder the executable runs from (`exe_dir()` in `commands/path_util.rs`). Everything a specific plugin owns — its `fs` sandbox (`data/`) and its `storage` key/value file (`storage.json`) — lives inside that plugin's own subfolder under the resolved `plugins/` dir. Nothing is written under the OS's per-user app-data directory anywhere in this app.

### Building a plugin

No per-plugin `package.json` — all plugins share the repo root's `node_modules` (esbuild, `@types/react`, etc.). Build with the shared wrapper:

```sh
node scripts/stewrd-plugin-build.mjs plugins/<name> --watch
# or, from inside the plugin's own folder:
node ../../scripts/stewrd-plugin-build.mjs . --watch
```

This bundles `index.{tsx,ts,jsx,js}` (whichever exists) and everything it imports into a single `dist/index.js` ESM file. `react`, `react-dom` (+ subpaths incl. `jsx-runtime`), and `@tauri-apps/api/*` are left `external` — they resolve at runtime via the host's import map (§5), not bundled in. A plugin wanting a third-party library just adds it as a normal `devDependency` at the repo root and lets esbuild inline it; there's no host-side runtime module resolution beyond what's external.

`dist/` is gitignored per-plugin — **a fresh clone has no built plugin output at all**, see §9.

### Starting a new plugin

Copy `plugins/_template/` wholesale, rename the folder, update `plugin.json`'s `id`/`name` and `settings.json`'s `category`/`version`. `plugins/_template/index.tsx` has a commented-out example of **every** API surface — uncomment what you need. `plugins/_template/README.md` covers the same manifest/lifecycle info as this section, kept in the template for a plugin author who never opens this ARCHITECTURE.md — give your own new plugin folder a README too (`claude.md` expects one per plugin).

**Install-time equivalent:** `plugins/CLAUDE.md` (this repo's copy ships to every install via `tauri.conf.json`'s `bundle.resources`, alongside a standalone `plugins/build-plugin.mjs` and `plugins/.stewrd/plugin-api.d.ts`) is the same guidance, condensed and self-contained, for someone with only the installed app and no repo clone — it's what an AI assistant opened in `<install>/plugins/` auto-loads. This ARCHITECTURE.md itself also ships to every install's root (see §9a), so `plugins/CLAUDE.md` links up to it for full host-internals depth rather than duplicating everything below — keep both in sync with this section and §6/§7 when either changes.

### Type-checking while authoring a plugin

`plugins/.stewrd/plugin-api.d.ts` declares an ambient `stewrd-plugin-api` module — a **hand-maintained flat copy** of `src/shared/plugin-api.d.ts`'s public shape (no cross-directory imports, so it works from any plugin folder standalone). Plugins reference it via a triple-slash directive:

```ts
/// <reference path="../.stewrd/plugin-api.d.ts" />
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
```

This is **editor-only** — plugins get no real module resolution back to the host at runtime; the actual `api` object arrives as a plain JS argument to `activate()`/`Component`. **If you change `src/shared/plugin-api.d.ts`, you must hand-update `plugins/.stewrd/plugin-api.d.ts` to match** — there's no generator (there's exactly one plugin author currently, so this wasn't worth automating).

---

## 4. Host reliability & lifecycle mechanisms

- **Boot safety (mark-before-run):** before Blob-URL `import()`, the loader calls `mark_plugin_attempt(pluginId)` which persists to `boot-marks.json` next to the running executable; the mark is cleared only after both `import()` and `activate()` succeed. On next launch, `reconcile_boot_marks` auto-disables (writes into `disabled-plugins.json`) any plugin still marked from the previous run — this catches a hang/crash during module evaluation itself, not just inside `activate()`. This is the *only* auto-disable mechanism — there's no separate N-failures counter.
- **Safe mode:** dropping a `SAFE_MODE` file directly next to the running executable (`is_safe_mode` in `commands/plugins.rs` checks `exe_dir()/SAFE_MODE`, *not* inside the `plugins/` subfolder) makes `usePluginRegistry` skip loading anything. `App.tsx` shows a banner when active.
- **Error isolation, and ALL exceptions reaching the status bar:** `PluginErrorBoundary` (`src/host/errors/PluginErrorBoundary.tsx`) wraps each mounted plugin's `Component`, catching render/lifecycle throws into an inline error card with a "Reload this plugin" button, and also logs the error via `logToHost` (below). `registerGlobalErrorHandlers()` (`src/host/errors/globalErrorHandlers.ts`) installs `window.addEventListener("error"/"unhandledrejection")` listeners as a backstop for errors a boundary can't catch (event handlers, timers, unhandled promise rejections) — both log to console **and** route into `logToHost`, so they reach the status bar/persistent log the same as everything else. Backend (Rust) errors are covered too, without any logging code inside the commands themselves: higher-risk commands (fs/storage/shell/plugin-install) are registered under thin renamed wrappers in `commands/logged.rs` (see §9) that log `Err` results, and `lib.rs`'s `setup()` installs a `std::panic::set_hook` that logs any Rust panic. Both wrapped-command errors and panics write to `<exe-dir>/stewrd.log` *and* emit a `log-line` Tauri event so a running frontend updates live (`App.tsx` listens for it) — in a **release** build, a panic aborts the process right after the hook runs (`panic = "abort"` in `Cargo.toml`), so the file still gets the entry but the live push only reliably lands in dev/debug builds; `StatusBar.tsx` also hydrates its history from `read_log_lines` on startup so nothing is lost across a restart either way.
- **Generation tokens:** every plugin (re)load bumps a `generation` counter (`createPluginApi.ts`). `statusIcon`/`log`/`toast` calls made through a stale (superseded) context **throw** instead of silently mutating shared state after teardown — this is what makes a lingering async callback fail loudly after hot-reload instead of corrupting a newer generation's state. `storage`/`shell`/`fs`/`modal` are *not* generation-guarded; `ctx.signal` is the intended cancellation path for those, though nothing wires `shell.spawn`'s child process to that signal automatically (see §6's `api.shell` row).
- **Hot add/remove:** the fs watcher's `plugin-changed` event payload is just the changed directory name. `usePluginRegistry` looks the dir up in a fresh `list_plugins()` call: missing/now-disabled → unload + remove sidebar entry; known+loaded → hot-reload; unknown → hot-add (loads immediately if `background: true`, else just lists it lazily).
- **Hot-reload ordering gotcha:** `usePluginRegistry.loadOne` imports and activates the **new** instance first and only unloads the **old** one afterward — briefly, two generations of the same plugin are both live, and the old one's teardown runs *after* the new one's `activate()`. This bites any plugin that keys a host-side resource by something constant (its own `pluginId`, say) rather than by generation: e.g. `git-tracker` calls `invoke("start_interval", { key: "git-tracker" })` in `activate()` and `invoke("stop_interval", { key: "git-tracker" })` in its `onDispose`; on a hot-reload the new `start_interval` fires, then the *old* context's `onDispose` fires `stop_interval` for the same key, killing the interval the new generation just started. If you use a raw `invoke`-based resource keyed by `pluginId` (§6), key it by generation instead, or accept that hot-reload temporarily breaks it until the next full app restart.

---

## 5. The plugin loading mechanism (why it's not a normal dynamic `import()`)

This was the highest-risk, most-revised part of the design (`docs/architecture-plan.md` has the full history of two rejected approaches — read it before changing this). Short version:

1. Rust reads a plugin's built `dist/index.js` as **text** and returns it over IPC (not served via any URL scheme).
2. Frontend does `URL.createObjectURL(new Blob([source], {type: "text/javascript"}))` and `import()`s that Blob URL. A Blob URL's module realm is the **document's own realm** — genuinely same-origin, unlike Tauri's asset-protocol origin (`asset://localhost`), which is a real cross-origin split that would break sharing React.
3. Because the plugin bundle is fully self-contained (all relative imports inlined by esbuild at build time), the only unresolved specifiers left in it are bare ones: `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `@tauri-apps/api/core`, `@tauri-apps/api/event`. These resolve against a native `<script type="importmap">` injected into the host's own `index.html` by `scripts/vite-plugin-react-importmap.ts` — realm-scoped, so it applies to the blob-loaded module too.
4. That import map's *targets* can't be hand-written. In `tauri dev`/`vite dev`, the targets are the static facade URLs themselves (`/src/host/vendor-entries/<file>.ts`) — Vite's normal dev transform pipeline rewrites the facade's own `export {...} from "react"` line with real named exports the same way it would for any app source file. In a production build, targets are the content-hashed chunk filenames Rollup/Rolldown emits, read out of the finished bundle (`ctx.bundle` in the Vite plugin) — this is the half that genuinely can't be a static path. Either way, `src/host/vendor-entries/*.ts` are empty facade files whose real body is generated by the Vite plugin's `load()` hook, re-exporting the real package's named exports explicitly (a plain `export * from "react"` doesn't work — react/react-dom are CJS, and Rolldown's CJS interop yields zero statically-known export names from a star re-export).
5. **Hot reload** needs no cache-busting scheme: every reload creates a brand-new Blob URL (and revokes the old one after teardown), so each reload is trivially a distinct module.

If you need to add a new bare specifier that plugins should be able to import directly (beyond React and the two Tauri API entry points already covered), you'll need to: add a vendor-entries facade file, register it in both `BUILD_SPECIFIER_TO_ENTRY_NAME`/`VENDOR_ENTRY_SPECIFIERS` in `scripts/vite-plugin-react-importmap.ts`, add it to `rollupOptions.input` in `vite.config.ts`, and add it to esbuild's `external` list in `scripts/stewrd-plugin-build.mjs`.

---

## 6. Everything a plugin can use (`PluginContext` / `PluginApi`)

Canonical shape: `src/shared/plugin-api.d.ts`. Assembled per-activation by `src/host/api/createPluginApi.ts`, which composes the per-surface files under `src/host/api/`. This table is the single source of truth for per-surface behavior — update it here, not in scattered prose elsewhere in this doc.

```ts
interface PluginContext {
  api: PluginApi;
  tick: TickHandle;
  pluginId: string;
  signal: AbortSignal;       // aborted by host on deactivate — pass to fetch()/cancelable loops
  onDispose(fn: () => void): void;  // disposal bag for anything NOT covered by a tracked API below
}
```

| Surface | Shape | Implementation | Notes |
|---|---|---|---|
| `api.theme` | `{ palette: Palette; subscribe(fn): unsubscribe }` | `host/api/theme.ts` | Reads/subscribes to `appStore`'s derived `palette`. Switchable in Settings > Themes between premade palettes (`shared/palette.ts` `premadePalettes` - Dark/Light) or custom ones the user creates and saves; all host UI components read `palette` from the store (not a static `defaultPalette` import), so switching restyles the whole app live, not just plugins. |
| `api.statusIcon` | `{ set(color, tooltip?); get() }` | `host/api/statusIcon.ts` | Drives the colored dot next to the plugin's sidebar entry. `color` is a `StatusColor`: `"idle" \| "in-progress" \| "success" \| "warning" \| "error"`. Generation-guarded (throws if called after deactivation). **Silently does nothing** if called before the plugin's sidebar entry exists in `appStore` — relevant for `background: true` plugins calling this early in `activate()` (see §4). A throwing tick handler does **not** automatically set this to `"error"` — only a watchdog timeout sets `"warning"` (see §7); a plugin must set `"error"` itself in its own catch. |
| `api.modal` | `{ error(), info(), question(), confirm() }`, all return Promises | `host/api/modals.ts` + `components/Modal/Modal.tsx` | Host-rendered blocking-style overlay, one at a time via a queue in `appStore`. `question` resolves with the chosen button label; `confirm` resolves `boolean` and defaults its button labels to `"Confirm"`/`"Cancel"` if not given. |
| `api.sidebar` | `{ setItems(items); setSelected(id) }` | `host/api/sidebar.ts` | Registers sub-items (`{ id, label, icon?, color?, onClick }`) that render indented under the plugin's own sidebar row (`SidebarSubItems.tsx`, sibling of `SidebarPluginItem`, 12px font matching `SidebarFooter`'s "Settings" row, not shown in the collapsed rail). Each item shows a status dot in front of its label - `color` (a `StatusColor`) is fully plugin-controlled, defaulting to a plain `palette.textMuted` dot if omitted. The plugin owns the full item list, when it's shown (`setItems` non-empty) vs. hidden (`setItems([])`), and each click's behavior via `onClick`. The host activates the plugin and highlights the clicked item itself; `setSelected` lets a plugin override the highlight programmatically. Clicking the plugin's own sidebar row toggles its sub-items collapsed/expanded while that plugin is already the active selection (clicking an inactive plugin's row just selects it, leaving its collapse state untouched) - the disclosure triangle itself is a separate click target from the rest of the row and always toggles regardless of active state (activating the plugin first if it wasn't already), so a lazy plugin's sub-items can be collapsed on the very first click even though they render expanded by default once it activates. State is `appStore.sidebarSubItemsExpanded`, default expanded, persisted via `hostSettings` so the sidebar's collapsed/expanded layout survives a restart. Generation-guarded like `statusIcon` (throws if called after deactivation); stored per-plugin in `appStore.sidebarItemsByPlugin`/`sidebarSelectedByPlugin`, cleared on real deactivation only (a hot-reload's new generation registers before the old one tears down, so the clear is guarded the same way `createPluginApi.ts`'s `currentGeneration` check already is). The sidebar row itself shows a disclosure triangle (▾/▸, matching `SidebarCategory`) whenever a plugin either currently has non-empty items or is remembered (`appStore.pluginsWithSidebarItems`, persisted via `hostSettings`) to have registered items in a past session - so a lazy (`background: false`) plugin's expandability is visible at startup without requiring reactivation first. |
| `api.toast` | `{ show({title?, message, kind?, durationMs?}) }` | `host/api/toast.ts` + `components/Toast/ToastContainer.tsx` | Non-blocking, auto-dismisses after `durationMs` (default 3000ms), and also has a manual dismiss (×) button. `title` is optional structured content (bold header line) — no arbitrary React nodes accepted, to avoid rendering stale content from a torn-down plugin generation. `kind` is a `StatusColor`, not free-form text — it's rendered by mapping straight to `palette.status[kind]`. Generation-guarded. |
| `api.ui` | `{ TextBox, StatusDot, MaskIcon, TextButton, IconButton, IconTextButton, Checkbox, RadioGroup, Toggle, Spinner, ProgressBar, Skeleton, Dropdown, DropdownCheckboxes, DropdownRadio, DropdownImageText, DropdownImageGrid, Tabs, Pagination, Menu, Link, Blanket, Drawer, InlineDialog, Banner, RangeSlider, Calendar, DatePicker, TimePicker, DateTimePicker, CodeTextArea }` React components, a flat map (not nested namespaces) | `components/<Name>/<Name>.tsx` | The *only* shared UI kit exposed to plugins — always use these instead of raw-importing from `src/components` or hand-rolling `<button>`/`<input>`/`<select>` (plugins have no module resolution back to host source anyway). Every entry sources color exclusively from `Palette` fields (or values derived from them via `components/shared/styles.ts`'s `contrastText`/`scrimColor` helpers) — never a literal hex. `IconButton`/`IconTextButton`/`DropdownImageText`/`DropdownImageGrid`/`Banner` image props take a `data:` URL — see plugins/_template/README.md's icon contract (`import` for bundled assets, `api.fs.readDataUrl` for runtime ones). `Blanket`/`Drawer`/`InlineDialog` render with `position: absolute` against the nearest positioned ancestor, which `MainContent.tsx`'s `<main>` provides (`position: relative`) so overlays stay scoped to the plugin's content area instead of covering the sidebar/status bar. `Banner.tone` is a palette-token union (`StatusColor \| "accent" \| "surface"`), never a raw color. See plugins/_template/README.md's "Component Library Coverage" table for a live demo of every one. `Modal`/`ToastContainer` are **not** part of `api.ui` — they're host-rendered singletons you trigger via `api.modal`/`api.toast` instead. |
| `api.shell` | `{ exec(cmd, args, opts?), spawn(cmd, args, opts?) }` | `host/api/shell.ts` → Rust `run_command`/`spawn_command`/`kill_command` in `commands/shell.rs` | **Arbitrary process execution, fully trusted, no allowlist.** `exec` awaits full output (`{code, stdout, stderr}`) — only rejects on spawn failure, non-zero exit is a normal resolved value. `spawn` streams `stdout`/`stderr` (batched ~30ms server-side) via Tauri events and returns `{pid, kill(), done}` — but note: `pid` reads `-1` until the underlying `invoke` resolves (calling `kill()` before then is a silent no-op), the output/exit listeners attach only *after* that resolution so very early output or an immediately-exiting process can race it, and `code` reads `-1` for a killed or code-less exit. **Nothing kills a spawned child automatically when the plugin deactivates** — that's on the plugin, via `ctx.onDispose(() => child.kill())`; none of the three shipped example plugins actually do this today (git-tracker's `claude -p` spawn, for instance, outlives deactivate/hot-reload and is only cleaned up at full app exit via `lib.rs`'s `RunEvent::Exit` handler). Always pass `program`/`args` separately — never build a shell string. Output is never auto-logged (may contain secrets). |
| `api.storage` | `{ get<T>(key), set<T>(key,val), getAll<T>() }` | `host/api/storage.ts` → Rust `storage_get`/`storage_set`/`storage_get_all` in `commands/storage.rs` | Per-plugin JSON file at `<plugins-dir>/<pluginId>/storage.json` (see §3 for what `<plugins-dir>` resolves to), auto-namespaced (you never construct the path). Writes are atomic (tmp-file + rename). **Plaintext on disk — no secrets.** |
| `api.fs` | `{ readTextFile(path), writeTextFile(path, contents), readDataUrl(path), listDir(path?), getRootPath(), deleteFile(path), renameFile(from, to), watchFile(path, onChange) }` | `host/api/fs.ts` → Rust `fs_read_text_file`/`fs_write_text_file`/`fs_read_data_url`/`fs_list_dir`/`fs_get_root_path`/`fs_delete_file`/`fs_rename_file` in `commands/fs.rs` | Raw file access **scoped to `<plugins-dir>/<pluginId>/data/`** — paths are resolved relative to that root and any path that would escape it (e.g. via `..`) is rejected server-side. Writes atomic (tmp+rename), but the tmp file is just the target path with its extension swapped for `.tmp` (`with_extension("tmp")`) — two concurrent writes to `notes.txt` and `notes.json` in the same plugin would stage through the same `notes.tmp` and can clobber each other; keep filenames distinct beyond their extension if you write concurrently. `listDir` returns `[]` for a directory that doesn't exist yet (not an error) but still propagates real I/O errors; `getRootPath` returns the plugin's absolute sandbox folder on disk (e.g. to give a spawned process a real `cwd` — that process itself is **not** sandboxed the way these calls are); `renameFile` creates the destination's parent folder as needed. These four were added generically alongside `notepad` (their first consumer) since any file-backed plugin managing more than one file needs them. **`watchFile` is a documented no-op stub today** (`fs.ts` logs a warning and returns a no-op unsubscribe) — no plugin needs it yet; implement it if you become the first consumer. For access to files *outside* a plugin's own sandboxed folder (e.g. editing `~/.claude/settings.json`, as `claude-settings-editor` does), use `api.shell.exec` instead — that's the intended escape hatch. |
| `api.log` | `{ info(msg), warn(msg), error(msg) }` | `host/api/logging.ts` → Rust `append_log_line` | Writes to the in-memory ring buffer (`StatusBar`, capped at 500 entries) **and** a rolling persistent file `<exe-dir>/stewrd.log` (2MB cap, single-generation rotation to `.old`). `info` is stored/rendered at `StatusColor` level `"idle"` (grey), `warn` at `"warning"`, `error` at `"error"` — there's no separate "info" color. Generation-guarded. Explicit logging is not the only thing that reaches the status bar — see below. |
| `api.ai` | `{ run(prompt, opts?) }` → `{ pid, kill(), done: Promise<string> }` | `host/api/ai.ts` → `ctx.api.shell.spawn` | The single launch point for headless AI CLI invocations in this app — currently always spawns the `claude` CLI, isolated behind this one surface so a different provider can be substituted later without touching every call site. `opts`: `model`, `allowedTools`/`disallowedTools`, `extraArgs` (raw passthrough CLI args), `cwd`, `onStdout`/`onStderr` (streaming). `done` resolves with the full accumulated stdout on a clean exit, rejects with a stderr-aware error otherwise. Used by Settings' palette-from-media generator, `git-tracker`'s "Ask Claude", and `notepad`'s wiki harvester — none of them spawn `claude` directly anymore. |
| `ctx.tick` | `{ register(fn), unregister(), requestWake(afterMs?), setInterval(ms\|null) }` | `host/scheduler/tickScheduler.ts` | See §7. `setInterval`/`requestWake` are inert until `register(fn)` has been called at least once — there's no handler to run otherwise. Runs while the plugin is loaded, independent of whether its Component is mounted — but throttled by the webview when the window is minimized/occluded (see §7's caveat, and the Rust-interval pattern below). |
| Raw `@tauri-apps/api/core` / `@tauri-apps/api/event` | `invoke`, `listen` | shared via the import map (§5), not part of `PluginApi` | Escape hatch for advanced plugins needing something beyond the standard surface — e.g. `git-tracker` calls `invoke("start_interval", ...)` / `listen("interval-tick:...")` directly, and `marketplace` calls `invoke("install_plugin_from_url", { url, fileName, mode: "install" | "update", expectedDir? })` directly (see below). Only use this for host-provided commands (the ones registered in `lib.rs`'s `invoke_handler!`); you cannot add new Rust commands from a plugin. Anything keyed by a plain string here isn't generation-scoped by the host — see §4's hot-reload ordering gotcha. |

**Rust-side interval, for background work that must survive a minimized window:**

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

invoke("start_interval", { key: "my-plugin-id", intervalMs: 60_000 }); // clamps to >= 1000ms
const unlisten = await listen("interval-tick:my-plugin-id", () => { /* do the check */ });
// on deactivate:
invoke("stop_interval", { key: "my-plugin-id" });
```

`ctx.tick` (§7) runs in the webview's JS timers, which WebView2/WKWebView throttle when the window is hidden/minimized/occluded — this pattern (`src-tauri/src/commands/interval.rs`, one `tokio::interval` per key) is the escape from that. See `plugins/git-tracker/index.tsx` for the full pattern in use, and §4 for the hot-reload caveat that specific plugin currently has.

**Raw invoke for a real PTY — `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill`:** for plugins needing an interactive terminal (real TTY: resize, line-discipline, ANSI escapes) rather than `api.shell`'s piped stdout/stderr. Backed by the `portable-pty` crate (ConPTY on Windows, native PTY on macOS/Linux) in `src-tauri/src/commands/pty.rs`. `pty_spawn(id, program, args, cwd?, env?, cols, rows) -> Promise<string>` (echoes back the same `id`, forces `TERM=xterm-256color`); `pty_write({ id, data })`; `pty_resize({ id, cols, rows })`; `pty_kill({ id })` (no-op on an unknown id). Unlike `api.shell.spawn`, **the caller supplies `id`** (generate a UUID) instead of getting one back from `pty_spawn` — this is required, not optional: output starts flushing to `pty-output:<id>` within ~16ms of spawning, so the caller must `listen("pty-output:<id>")`/`listen("pty-exit:<id>")` *before* calling `invoke("pty_spawn", ...)`, or early events (including, on Windows, the terminal's own startup handshake — see below) are silently dropped by Tauri with nothing left to receive them. `pty-exit:<id>` fires once, after all output has been flushed, with `{ code }`. An `id` already in use by a live session makes `pty_spawn` reject with an error — never reuse an id until its `pty-exit` has fired. **Windows cursor-position-report gotcha:** ConPTY writes a Device Status Report query (`ESC[6n`) to the output stream on startup and holds back further rendering until a reply (`ESC[<row>;<col>R`) is written back via `pty_write` — a real terminal emulator (xterm.js) answers this automatically via its `onData`, but anything else consuming `pty-output` directly must answer it itself or the terminal will appear to hang blank. Killing a spawned PTY session on plugin deactivate is the plugin's own responsibility (`ctx.onDispose(() => invoke("pty_kill", { id }))`), same as `api.shell.spawn`; any still-live PTY sessions are force-killed at full app exit via `lib.rs`'s `RunEvent::Exit` handler regardless.

**Raw invoke for a command with no `PluginApi` surface at all — `install_plugin_from_url`:** the `marketplace` plugin downloads/installs a community plugin release from its own catalog by calling this command directly, the same tier as `git-tracker`'s `start_interval` above. It exists because a release asset's `browser_download_url` has no CORS header, so the plugin can't `fetch()` the zip bytes itself — only `raw.githubusercontent.com`/`api.github.com` are CORS-safe from the webview. The command (`src-tauri/src/commands/plugin_install.rs`) shares its core extraction/verification logic with `install_plugin_from_archive` via `install_from_bytes(plugins_dir, bytes, file_name, mode, expected_dir)`; `mode: "install"` behaves exactly like the existing archive-upload flow, `mode: "update"` extracts to a throwaway temp dir first, verifies there, and only then copies the entry file/`icon.png`/`plugin.json`/merged `settings.json` into the live folder (tmp+rename per file, never `remove_dir_all` on a live folder) — `storage.json`/`data/` are never touched. Both modes reject an archive whose `manifest.api_version != SUPPORTED_API_VERSION` before any disk write.

---

## 7. Tick scheduler (`src/host/scheduler/tickScheduler.ts`)

Framework-agnostic singleton (no Tauri/React deps — independently unit-tested in `tickScheduler.test.ts`), one `TickHandle` per plugin activation (created in `createPluginApi.ts`).

- **Zero registered work due = zero timers.** A single `setTimeout` sized to the nearest deadline across all handles, recomputed after every fire.
- API: `register(fn)`, `unregister()`, `requestWake(afterMs?)` (one-off), `setInterval(ms | null)` (recurring). Uses `performance.now()`, not wall-clock time (avoids catch-up storms after sleep/NTP steps).
- **Overlap handling:** if a handler is still running when its interval would fire again, the scheduler coalesces (no concurrent second invocation) and anchors the next deadline to *completion time*, not the original scheduled time — a slow handler self-throttles instead of drifting into back-to-back runs.
- **Watchdog — notification only, does not free the slot:** each handle has a per-handler timeout (default 30s, passed to `createHandle`). A handler whose returned promise never settles triggers `onWatchdogTimeout` once (wired in `createPluginApi.ts` to set that plugin's status icon to `warning` and log it) — but `entry.isRunning` stays `true` until the promise actually settles, and both the scan (`runPass`) and the reschedule logic skip entries with `isRunning`. **A truly hung handler blocks that handle's ticks forever**, not just until the watchdog fires; the watchdog is a warning, not a recovery mechanism. Don't rely on it to keep a plugin's polling alive through a hung network call — the handler itself needs a timeout (e.g. via `ctx.signal` + `AbortController`, or an explicit `Promise.race`).
- **Reentrancy-safe:** mutations (register/unregister/setInterval) made *during* an in-progress scan are queued and applied after, never applied mid-scan.
- **Timer overflow guard:** clamps to `2^31-1`ms so a far-future deadline can't overflow `setTimeout` into firing immediately.
- **Known limitation (by design, not a bug to "fix" casually):** WebView2/WKWebView throttle JS timers (often to ≥1s) when the window is hidden/minimized/occluded. If a plugin's background work must run reliably regardless of window state, use the Rust-side interval pattern in §6 instead — do not try to make the JS scheduler itself immune to this, it's a webview-level constraint.

---

## 8. Host shell architecture

```
App.tsx
 ├─ Sidebar.tsx (width 220, or 48 when collapsed)
 │   ├─ expanded: SidebarCategory.tsx[] (grouped by each entry's resolved `category` - settings.json, falling back to plugin.json - resolved against appStore's categories, falling back to "Other") → SidebarPluginItem.tsx[] (indented, name + StatusIcon + optional plugin icon; click → setPaneTool, unless already the active pane's plugin *and* `view === "plugin"`, in which case it toggles its sub-items instead - `view` is checked so that clicking a plugin's row from Settings always calls `setPaneTool`/returns to the plugin view, even when that plugin still occupies the active pane) + SidebarSubItems.tsx (further-indented, plugin-registered sub-items via api.sidebar.setItems - hidden when empty, not rendered in the collapsed rail)
 │   ├─ collapsed: SidebarCategoryCollapsed.tsx[] (category icon via categoryIcons.ts, or ▸/▾ fallback) → icon-only SidebarPluginItem row per plugin
 │   ├─ SidebarLayouts.tsx / SidebarLayoutsCollapsed.tsx — appears once a layout is saved or more than one pane is open (see §1a)
 │   └─ SidebarFooter.tsx (expanded: "Settings" + "<<"; collapsed: just ">>") — pinned to the bottom of the sidebar, height-matched to StatusBar's summary row
 └─ content column (flex: 1)
     ├─ MainContent.tsx → `view === "settings"` renders SettingsPage.tsx, else recursively renders `appStore.paneTree` (PaneView → PaneLeafView/PaneSplitView, see §1a), each occupied leaf wrapping its plugin in PluginErrorBoundary → <Component api={...} />
     └─ StatusBar.tsx (bounded 500-entry ring buffer + severity color; also persisted to <exe-dir>/stewrd.log; expanded log renders as an overlay above the fixed-height summary row, not by growing it) — spans only the content column's width, not the sidebar
Modal.tsx / ToastContainer.tsx — rendered once at app root, driven by appStore's modalQueue/toasts
```

- `usePluginRegistry()` (`host/loader/usePluginRegistry.ts`) is the single source of truth for discovered/loaded plugins; `App.tsx` feeds its `entries` into `appStore.setPlugins` for the sidebar, and calls `ensureLoaded` for every plugin id currently occupying a pane (`collectPaneToolIds(appStore.paneTree)`) whenever that set changes.
- `appStore` (`host/state/appStore.ts`, zustand) holds: `plugins` (sidebar entries + status + `dir`), `paneTree`/`activePaneId`/`layouts`/`draggingPluginId` (see §1a), `statusLog`, `categoriesExpanded`, `categories`, `paletteId`, `customPalettes`, `palette` (derived from the previous two, always resolves to a real `Palette`), `taskbarBadgeThreshold`, `hostSettingsLoaded`, `modalQueue`, `toasts`, `sidebarCollapsed`, `sidebarItemsByPlugin`, `sidebarSelectedByPlugin`, `sidebarSubItemsExpanded`, `pluginsWithSidebarItems`, `view` (`"plugin" | "settings"`). Plugins never touch this directly — only through the `PluginApi` surfaces in §6.
- `hostSettings.ts`'s `saveHostSettings` is fire-and-forget (called from synchronous zustand actions) - a write started microseconds before the app quits can in theory still be lost, which is accepted deliberately: an earlier attempt to intercept `onCloseRequested` and await a flush before quitting used `Window.destroy()`, which the app's `capabilities/default.json` never granted (`core:window:allow-destroy` is missing), so every close silently failed and the window became unclosable. Do not reintroduce that pattern without granting the permission first and testing an actual `WM_CLOSE`/titlebar-X close (`.NET`'s `CloseMainWindow()` is not an equivalent signal and will falsely appear to work).
- `commands/storage.rs`'s `storage_set` serializes every write behind a single process-wide `Mutex` (`write_lock()`) - it's a read-whole-file/mutate-one-key/write-whole-file operation, so two concurrent `storage_set` calls for the same `plugin_id` (common at startup: several `appStore` actions each fire their own independent `saveHostSettings()` close together, e.g. a plugin registering sidebar items around the same time a category gets toggled) could otherwise interleave and silently lose one write - this is why `categoriesExpanded`/`sidebarSubItemsExpanded` previously failed to persist.
- The taskbar icon gets a small overlay "badge" dot (Windows only) when the worst status across every plugin (`host/layout/categoryStatus.ts`'s `worstStatus`, same error > warning > in-progress > success priority used for sidebar category tinting) reaches the user's configured threshold. `host/taskbarBadge.ts` renders the dot onto an off-screen canvas using the active palette's `status` color (so it stays theme-correct, never a hardcoded color) and calls Tauri's `Window.setOverlayIcon`; `App.tsx` recomputes it on every `plugins`/`taskbarBadgeThreshold`/`palette` change, guarded with a request-token ref so an in-flight async render can't clobber a newer one. Threshold is set in Settings > General (`off` / `success`-or-worse / `warning`-or-worse (default) / `error`-or-worse) and persists via `hostSettings.ts`.
- Category icons are **not** Vite-bundled - they're read at runtime from `<exe-dir>/assets/category-icons/` (a `<name>.png`) via the `list_category_icons` command (`commands/category_icons.rs`), so a user can drop in more icons after install without a rebuild. `src/assets/category-icons/` is only the dev-time source: `build.rs` copies it into `target/<profile>/assets/category-icons/` for `cargo run`/`tauri dev`, and `tauri.conf.json`'s `bundle.resources` copies it next to the exe for a packaged build - both land in the same exe-relative layout `category_icons.rs` reads from. `appStore.loadCategoryIcons()` fetches the list once at startup (and on demand via the "Refresh icon list" button in Settings > Categories); `host/layout/categoryIcons.ts` is just a pure `find`/`map` helper over that list. Which icon name a category uses is chosen in Settings > Categories, not inferred from the category name; categories with no icon assigned fall back to the ▸/▾ disclosure glyph in the collapsed sidebar.
- Categories are app-controlled (Settings > Categories, persisted via `hostSettings.ts`), seeded with `Other`/`Utilities`/`Templates`. A plugin's resolved category (its `settings.json`'s `"category"` key, falling back to `plugin.json`'s legacy `category` field) must match a category's `id` or it's grouped under "Other" — adding a brand-new category to match a new plugin now requires a Settings edit, not just a manifest change. Categories are drag-reordered by their row in Settings > Categories (`setCategories`, persisted), which also drives the sidebar's top-to-bottom category order.
- Sidebar tools are drag-reordered within `SidebarPluginItem`/`SidebarCategory`; order is tracked as a flat list of plugin ids (`appStore.pluginOrder`, persisted via `hostSettings.ts`) and applied per-category in `Sidebar.tsx`. Dragging a tool into a different category's list also rewrites that plugin's own `settings.json` `"category"` key (`pluginDiscovery.ts`'s `setPluginCategoryFile`) via `movePlugin`, so the move survives a restart the same way a manual `settings.json` edit would.
- Plugin sidebar icons follow the same PNG convention as category icons, but scoped per-plugin and resolved differently: drop `icon.png` into the plugin's own folder (under the resolved plugins dir, not exe-relative); `get_plugin_icon` (`commands/plugin_icons.rs`) reads it by discovery `dir` and returns a data URL (`usePluginIcon.ts` fetches/caches per plugin `dir`).
- Both category and plugin icons render via `components/MaskIcon/MaskIcon.tsx`: a CSS `mask-image` (not `<img>`) tinted with `color` (default `currentColor`, i.e. whatever palette color the surrounding text already uses), so icons recolor live with the theme instead of keeping the source PNG's own baked-in colors. Trade-off: a mask flattens multi-color source art to one solid color, and only respects transparency the source PNG actually encodes.

### Settings (`SettingsPage.tsx` and siblings)

Five tabs, all in `host/layout/`:

- **General** (`SettingsGeneral.tsx`) — app name/version, plus the taskbar status badge threshold (see §8 above).
- **Categories** (`SettingsCategories.tsx`) — add/rename/delete categories and assign each one an icon (from `<exe-dir>/assets/category-icons/` - see §8). Renaming a category's display `name` is safe for existing plugins; its `id` (the value a plugin's resolved `category` must match) is fixed at creation. `Other` is built-in and can't be renamed or deleted.
- **Themes** (`SettingsThemes.tsx`) — pick a premade palette (`shared/palette.ts`'s `premadePalettes`: Dark/Light) or build a custom one (one color picker per `Palette` field) and save it. Selection persists via `hostSettings.ts` and applies live across the whole app and every plugin (`api.theme`).
- **Plugins** (`SettingsPlugins.tsx`) — lists every discovered plugin (including disabled/errored ones, via a direct `listPlugins()` call rather than `usePluginRegistry`, which filters disabled plugins out). Every row shows exactly three buttons, in this order: **Configure** — opens the plugin's own `settings.json` as raw JSON text (`read_plugin_settings_file`/`write_plugin_settings_file` in `commands/plugin_settings.rs`, JSON-validated client- and server-side before it's written, mirroring `plugins/claude-settings-editor/index.tsx`'s own file-editing pattern) unconditionally, even for a plugin with no `settings.json` yet (a starter `{ "category": "" }` is shown); **Activate/Deactivate** (`set_plugin_disabled`, emits `plugin-changed` so the toggle takes effect immediately instead of only on next restart); **Remove** (`remove_plugin`, confirmed via `createModalApi()`, deletes the folder). An "Add plugin" file picker installs a `.zip`/`.tar`/`.tar.gz`/`.tgz` via `install_plugin_from_archive` (`commands/plugin_install.rs`) — no Tauri dialog plugin, the webview reads the picked file itself and hands the bytes over.
- **Version** (`SettingsVersion.tsx`) — shows the installed version (moved here from General), whether a newer release is available or already staged ("restart to apply" only appears once an update has actually finished downloading — see §9a), and that installed version's own release notes (fetched via `list_releases`, matched by tag). Module-level 5-minute cache in `host/api/updates.ts` since the tab unmounts/remounts on every tab switch.

`General`/`Categories`/`Themes` persist through `hostSettings.ts`, a thin wrapper around the same `storage_get`/`storage_set` commands plugins use, namespaced under the reserved plugin id `"__host__"`. `Plugins` is different — it doesn't go through `hostSettings.ts` at all; it manages real plugin folders/files directly via the discovery/install/remove/configure commands above, including each plugin's own `settings.json`, not host-namespaced storage.

---

## 9. Rust backend surface (`src-tauri/src/`)

All commands are plain `#[tauri::command]` functions registered directly on the app's own `invoke_handler` — **deliberately not** `@tauri-apps/plugin-shell`/`plugin-fs`, because Tauri 2's capabilities/ACL system only scopes commands from *official* plugins (which require allowlisting each command+arg pattern — incompatible with "run anything the plugin author passes"). Commands on the app's own handler need no capability entry. This means `src-tauri/capabilities/` should stay essentially empty/minimal — don't reach for the official shell/fs plugins to "fix" this, it's intentional (see `commands/shell.rs`'s top comment and `docs/architecture-plan.md` §"Shell execution IPC flow"). The one exception is `core:window:allow-set-overlay-icon`, needed because the taskbar badge (§8) calls Tauri's own built-in `Window.setOverlayIcon` JS API, which — unlike the app's own commands — *is* gated by core ACL and isn't included in `core:default`.

| Command(s) | File | Purpose |
|---|---|---|
| `list_plugins`, `is_safe_mode`, `reconcile_boot_marks`, `mark_plugin_attempt`, `clear_plugin_attempt`, `set_plugin_disabled`, `remove_plugin` | `commands/plugins.rs` | Discovery (including `resolve_settings_string`'s settings.json→plugin.json fallback for both `category` and `version`) + boot-safety/disabled-list bookkeeping + plugin folder deletion. Corrupt state files never brick boot — read failures log a warning and act as if empty. |
| `install_plugin_from_archive` | `commands/plugin_install.rs` | Extracts an uploaded `.zip`/`.tar`/`.tar.gz`/`.tgz` (via the `zip`/`tar`/`flate2` crates, no external unzip/tar binary) into a fresh folder under the resolved plugins dir, with zip-slip protection and post-extract verification that `plugin.json`/its `entry` file actually landed. |
| `install_plugin_from_url` | `commands/plugin_install.rs`, wrapped by `commands/logged.rs` | Downloads a release zip server-side (`reqwest`, no CORS) and installs/updates it via the same `install_from_bytes` core as `install_plugin_from_archive` — used by the `marketplace` plugin's raw-invoke install/update flow (see §6). `mode: "update"` extracts to a temp dir, verifies, then copies into the live folder without ever removing it. |
| `read_plugin_settings_file`, `write_plugin_settings_file` | `commands/plugin_settings.rs` | Backs the Settings > Plugins "Configure" button — reads/writes a plugin's own `settings.json` as raw text (a missing file reads as a starter `{ "category": "" }` rather than erroring; a write is rejected server-side if it isn't valid JSON). No explicit `plugin-changed` emit needed — the write lands inside the already-watched plugins dir. |
| `run_command`, `spawn_command`, `kill_command` | `commands/shell.rs`, wrapped by `commands/logged.rs` (`run_command`/`spawn_command` only) | Arbitrary process exec/spawn/kill. `spawn_command` tracks children in `AppState` for both normal kill and exit-time cleanup. |
| `storage_get`, `storage_set`, `storage_get_all` | `commands/storage.rs`, wrapped by `commands/logged.rs` | Per-plugin JSON KV store, atomic writes. |
| `fs_read_text_file`, `fs_write_text_file`, `fs_list_dir`, `fs_get_root_path`, `fs_delete_file`, `fs_rename_file` | `commands/fs.rs` (`fs_read_text_file`/`fs_write_text_file`/`fs_delete_file`/`fs_rename_file` wrapped by `commands/logged.rs`; `fs_list_dir`/`fs_get_root_path`/`fs_read_data_url` registered directly) | Per-plugin scoped raw file access, atomic writes, path-escape rejection. `fs_list_dir` returns an empty list for a missing directory but propagates any other `read_dir` error; `fs_rename_file` creates the destination's parent directory as needed. |
| `start_interval`, `stop_interval` | `commands/interval.rs` | Rust-side `tokio::interval` heartbeat per string key, immune to webview timer throttling. |
| `pty_spawn`, `pty_write` (wrapped by `commands/logged.rs`), `pty_resize`, `pty_kill` (registered directly) | `commands/pty.rs` | Real interactive PTY via the `portable-pty` crate (ConPTY on Windows, native PTY elsewhere) — see §6 for the frontend contract and the listener-race/DSR gotchas. Session id is caller-supplied, not derived from the pid. Emits `pty-output:<id>` (batched ~16ms, UTF-8-safe across the batch boundary) and, once, `pty-exit:<id>` with `{ code }` after all output has flushed. All spawn/read/write/exit logic lives in plain inner functions taking `'static` sinks (`on_output`/`on_exited`/`on_exit_cleanup`) instead of borrowing `AppHandle`/`State` directly, so the reader/emitter/exit-waiter threads (and `pty_write`'s `spawn_blocking` task) can move them across a thread boundary, and so the Rust unit tests can call the inner functions directly with channel-backed sinks instead of constructing a real `AppHandle`. Sessions are tracked in `AppState.pty_sessions`; still-live sessions are force-killed at app exit alongside `child_pids` in `lib.rs`'s `RunEvent::Exit` handler. |
| `append_log_line`, `read_log_lines` | `commands/logging.rs` | `append_log_line` appends one JSON line to the rolling exe-dir log (2MB cap, one-generation rotation). `read_log_lines(max_lines)` returns just the tail of the current file (never `.old`) — used by `StatusBar.tsx` to hydrate history on startup. |
| (none directly — `commands/logged.rs`) | `commands/logged.rs` | Thin renamed (`#[tauri::command(rename = "...")]`) wrappers around the higher-risk fs/storage/shell/plugin-install commands above — same IPC name and behavior as the wrapped command, but logs `Err` results (to `stewrd.log` and live via the `log-line` event) before returning. The wrapped command's own file never imports or knows about logging; this is the only integration point, so a newly added risky command needs one wrapper added here, not a change to its own implementation. |
| `get_plugin_icon` | `commands/plugin_icons.rs` | Reads a plugin's `icon.png` (by discovery `dir`, validated as a single path segment) and returns it as a data URL. |
| `list_category_icons` | `commands/category_icons.rs` | Lists every `<name>.png` in `<exe-dir>/assets/category-icons/` (resolved via `std::env::current_exe()`, not app-data) as data URLs. Both icon commands share a `read_as_data_url` helper in `commands/icon_util.rs`. |
| `list_releases`, `pending_update_version` | `commands/updates.rs` | `list_releases` fetches the last ~10 GitHub Releases for the Settings > Version tab. `pending_update_version` reads `pending-update\meta.json` (if any) so the tab can say "restart to apply" only once a download has actually finished. See §9a. |
| (none exposed to JS) | `commands/watcher.rs` | Started once in `lib.rs`'s `setup()`; watches the resolved plugins dir (1s debounce) and emits a fixed `"plugin-changed"` event with the affected directory name as its **payload** (not a per-plugin event name). The `Debouncer` handle is kept in `AppState.plugin_watcher` — dropping it silently stops delivery, so it must stay owned somewhere. |

Also still registered but unused by any `PluginApi` surface: the scaffold `greet` command and `tauri_plugin_opener` init in `lib.rs` — harmless leftovers from `npm create tauri-app`, safe to remove if you're cleaning up but not currently in anyone's way.

`state.rs` (`AppState`): owns the plugin watcher handle, `child_kill_senders` (normal runtime kill path) and `child_pids` (redundant, used only in the `RunEvent::Exit` handler in `lib.rs` — a synchronous OS-level `taskkill`/`kill` call, since by exit time there's no guarantee the tokio runtime is still scheduled to act on an async oneshot signal). This split exists specifically to fix a real bug (child processes like `ping`/`claude` surviving graceful app exit on Windows) — don't collapse it back into one mechanism without re-verifying that case. `pty_sessions` (`HashMap<String, PtySession>`, keyed by the caller-supplied PTY session id) follows the same exit-time pattern — each session's `ChildKiller` is called directly (a synchronous OS call) in `RunEvent::Exit`, not through a channel signal.

---

## 9a. Auto-update (`commands/updates.rs`)

A self-built check-and-self-replace mechanism, deliberately **not** `tauri-plugin-updater` (that assumes an NSIS-installed app; `build-release.bat` deploys loose files) and **not wired into `build-release.bat`** (that script is Topher's local dev-deploy tool only — publishing a release is a separate, manual step below). See `docs/auto-update-options.md` for the full option comparison this was scoped down from.

`build-release.bat`'s plugin deploy step mirrors each source plugin folder into `DEPLOY\plugins\<id>\` individually (not the whole `plugins` root with one `/MIR`), so plugins installed at runtime via the archive installer — which only ever exist in the deploy folder, never in source — aren't purged. Each per-plugin mirror excludes `data/` (per-plugin `api.fs` files, e.g. notepad's `note.md`) and `storage.json` (per-plugin `api.storage` KV store) since those are runtime state with no source counterpart. `settings.json` is handled separately by `scripts/merge-plugin-settings.mjs`, which always takes `version` from source but preserves everything else (including `category`) from the deployed file, since those are user-editable at runtime.

**Version source of truth** is `tauri.conf.json`'s `version` field, not `Cargo.toml`'s — `build.rs` reads it at compile time and exposes it as `env!("STEWRD_APP_VERSION")`, so the running app's self-comparison and the tag used to publish a release can never drift independently of each other.

**On every launch** (release builds only — gated `#[cfg(not(debug_assertions))]` in `lib.rs`, since a dev build's `current_exe()` points at `target/debug/stewrd.exe`):
1. `apply_pending_update_if_present()` runs first, before the Tauri `Builder` even exists — if a newer build was staged last session, it uses the [`self-replace`](https://docs.rs/self_replace) crate to swap the running exe on disk for the staged one (the *next* launch picks up the new file; this process keeps running old code in memory until then), copies `assets/` over add-only, and writes a `just-updated.json` marker.
2. In `.setup()`, that marker (if present) produces a one-time `"Updated to vX.Y.Z."` status-bar log and **skips** this launch's check (avoids immediately re-downloading the release just applied). Otherwise, a background task hits `GET https://api.github.com/repos/tellek/stewrd/releases/latest`; a failure of any kind just logs a `"warning"`-level status-bar line and the app continues normally. A newer version triggers a download of the release's `.zip`+`.sig` assets, a minisign signature check against the public key embedded in `updates.rs` (`minisign-verify` crate), extraction, and an atomic-rename commit into `%LOCALAPPDATA%\stewrd\pending-update\` — then a `"success"` status-bar log telling the user to restart.

`apply_pending_update_if_present` (step 1 above) doesn't just self-replace the exe: `assets/` is copied add-only (a user's own custom category icons survive), and `ARCHITECTURE.md`/`plugins/CLAUDE.md`/`plugins/build-plugin.mjs` are copied **overwrite** (`overwrite_copy_if_present`) since they're host-owned reference docs/scripts, not user data — an in-app update keeps them current the same as a fresh install, not just a re-run of the NSIS installer. Installed plugin folders themselves (`notepad`, `_template`) are **not** touched by an in-app update either way — only a fresh/re-run installer updates those.

An `update.lock` file (opened with `share_mode(0)` — Rust's default `OpenOptions` does *not* exclude a second opener on Windows) coordinates both flows against two concurrently-running instances.

**Publishing a release** is automated by `.github/workflows/release.yml`, triggered by pushing a `vX.Y.Z` tag (a `workflow_dispatch` re-run against an already-pushed tag exists too, for retrying a failed step — it never creates tags or bumps versions itself). The only manual precondition:
1. Bump `version` in `tauri.conf.json` (and `package.json`/`Cargo.toml` for consistency).
2. Commit, then `git tag v<version> && git push origin v<version>`.

The workflow then builds, Authenticode-signs both the NSIS installer and `stewrd.exe` via Azure Artifact Signing (`src-tauri/tauri.release.conf.json`'s `bundle.windows.signCommand`, using `artifact-signing-cli`), packages and minisign-signs the self-update zip (`scripts/package-update-zip.mjs`, same zip layout as before — `stewrd.exe` and `assets/` at the root), and publishes the GitHub Release with the installer, the zip, and its `.sig` attached.

Required GitHub repo secrets (Settings → Secrets and variables → Actions): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (a service principal scoped to the `topher-birth` Azure Artifact Signing account's certificate profile, role `Artifact Signing Certificate Profile Signer`) and `TAURI_SIGNING_PRIVATE_KEY` (contents of `C:\Users\chris\.stewrd-signing\update-signing-key`, passwordless — **back it up**; losing it means no future update can ever be verified again by installs that already have the embedded public key). Account/endpoint/profile names are not secret and are inlined in `src-tauri/tauri.release.conf.json`.

---

## 10. Dev workflow

```sh
npm install
npm run plugin:build -- plugins/_template
npm run plugin:build -- plugins/notepad
npm run plugin:build -- plugins/claude-settings-editor
npm run plugin:build -- plugins/git-tracker   # build every plugin at least once — dist/ is gitignored,
                                                # so a fresh clone's sidebar is empty until this runs
npm run dev              # vite only, no Tauri window
npm run tauri dev        # full app in dev mode (hot reload for both host + plugins)
npm run build             # tsc + vite build (host only)
npm run tauri build      # packaged app for the current OS
npm test                  # vitest (currently: tickScheduler.test.ts)
```

For plugin dev, set `STEWRD_PLUGINS` to the repo's `plugins/` folder so `tauri dev` reads live source instead of the default `<exe-dir>/plugins` install location:

```sh
STEWRD_PLUGINS="$(pwd)/plugins" npm run tauri dev     # bash
$env:STEWRD_PLUGINS = (Resolve-Path plugins).Path; npm run tauri dev   # PowerShell
```

Run each plugin's own `stewrd-plugin-build.mjs --watch` alongside `tauri dev` so `dist/index.js` stays current; the Rust fs watcher picks up the change and hot-reloads just that plugin (subject to §4's hot-reload ordering gotcha for plugins using raw `invoke`-keyed resources).

Requires Node (esbuild/Vite/TypeScript toolchain) and a Rust toolchain (`cargo`) for the Tauri side — see Tauri's own prerequisites docs for OS-specific native dependencies (WebView2 on Windows, etc.) if starting from a machine that's never built a Tauri app before.

---

## 11. Current example plugins (reference implementations, not just demos)

| Plugin | `background` | Demonstrates |
|---|---|---|
| `_template` | `false` | Every API surface, commented out. Not itself functional — copy-from scaffolding only. Ships a live component showcase (`index.tsx` tabs, one per `demos/*.tsx` file) — see `plugins/_template/demos/` and its README's coverage table for details: <br>• `ButtonsDemo` — TextButton, IconButton, IconTextButton, Link <br>• `FormControlsDemo` — Checkbox, RadioGroup, Toggle, RangeSlider, TextBox <br>• `LoadingDemo` — Spinner, ProgressBar, Skeleton <br>• `DropdownsDemo` — Dropdown, DropdownCheckboxes, DropdownRadio, DropdownImageText, DropdownImageGrid <br>• `NavigationDemo` — Tabs, Pagination, Menu <br>• `OverlaysDemo` — Blanket, Drawer, InlineDialog <br>• `MessagingDemo` — Banner, StatusDot, toast <br>• `CalendarDemo` — Calendar, DatePicker, TimePicker, DateTimePicker <br>• `TextAreaDemo` — CodeTextArea, MaskIcon |
| `notepad` | `true` | Single-note markdown editor bundling its own CodeMirror 6 instance (the shared `api.ui.CodeTextArea` has no extension seam and no markdown language) with a hand-rolled live-preview mark-hiding decoration; `markdown-it`-based Reading view with custom escaped renderer rules for callouts/checklists/footnotes/wikilink styling; settings read from its own `settings.json` via the already-registered `read_plugin_settings_file` command (no in-app settings UI — configured entirely through Settings > Plugins > Configure); `api.fs.listDir/getRootPath/deleteFile/renameFile` (new, generic, added alongside this plugin — see §6) used by the harvester below; `background: true` harvester spawning `claude` with a real `cwd` and bounded-retry file archiving instead of an infinite resubmit loop. |
| `claude-settings-editor` | `false` | `api.shell.exec` (PowerShell + base64) to edit a file *outside* the plugin's own `api.fs` sandbox — the documented pattern for that case; JSON validation before save. **Windows-only** as written (hardcodes `powershell`/`$env:USERPROFILE`). |
| `git-tracker` | `true` | Eager background activation; the raw `invoke("start_interval"...)`/`listen("interval-tick:...")` escape hatch for minimize-proof polling (currently subject to §4's hot-reload ordering gotcha since it keys by a constant string, not generation); `ctx.tick` for lightweight UI-only refresh in parallel; `api.shell.spawn` streaming into a live-updating UI (asks a headless `claude -p` to summarize repo state) — its spawned `claude` process is not explicitly killed on deactivate (see §6's `api.shell` row). |
| `marketplace` | `false` | Raw `invoke("install_plugin_from_url"...)` escape hatch for a command with no `PluginApi` surface (see §6); renders the catalog as a plain `<table>` (Name/Description/Version/↓/Get) since no shared `api.ui` table component exists; catalog + per-repo release fetch against `raw.githubusercontent.com`/`api.github.com` (CORS-safe `fetch()`, no Rust needed for reads); eager (fetched for every visible row once the catalog loads, to populate the table's Version/↓ columns) + TTL-cached metadata fetch to stay under GitHub's unauthenticated 60/hour rate limit, with a distinct rate-limit-vs-offline cell state; caches under `api.fs`'s `data/` sandbox (never `api.storage`, which the fs watcher does *not* ignore — see §6's `api.fs` row); `api.modal.confirm` naming the repo/tag before every install; update detection by matching an installed plugin's manifest `id`/`dir` and comparing hand-rolled parsed semver (never "always offer update" for an unparseable version). |

---

## 12. Known gaps / things not to assume are done

Keep this list current — remove an item once it's actually implemented, add new ones as they're discovered. Each item links back to the section with the full detail; don't duplicate the explanation here, just index it.

- `api.fs.watchFile` is a no-op stub — §6 (`api.fs` row).
- `registerGlobalErrorHandlers()` only `console.error`s, no status-bar/log routing or plugin attribution yet — §4.
- No frontend schema validation of `plugin.json` — only Rust's `serde` parse + `apiVersion` check — §3.
- No third "read-only bundled examples" plugin tier — only `STEWRD_PLUGINS` and the `<exe-dir>/plugins` default are implemented, and there is no per-user app-data fallback — §3.
- `plugin.json`'s `icon` field is unused beyond accepting `"default"` — plugin sidebar icons come from an `icon.png` in the plugin's own folder instead, rendered as a theme-tinted CSS mask — §6 (`api.theme` row).
- Tick scheduler's watchdog only warns; it does not free up or recover a genuinely hung handler — §7.
- No plugin resource is auto-killed on deactivate beyond the tick handle and abort signal — spawned child processes in particular outlive deactivate/hot-reload until full app exit unless the plugin kills them itself — §2, §4, §6 (`api.shell` row).
- `deactivate()`'s return value isn't awaited during teardown, and `onDispose` callbacks run *before* `ctx.signal` is aborted, not after — §3 (Lifecycle step 5).
- Hot-reload activates the new plugin generation before tearing down the old one, which breaks any plugin keying a raw `invoke`-based resource by a constant string instead of by generation (current real example: `git-tracker`'s `start_interval`/`stop_interval` key) — §4.
- A throwing tick handler logs and calls `onError`, but does not set the plugin's status icon to `"error"` automatically — §6 (`api.statusIcon` row).
- Scaffold leftovers (`greet` command, `tauri_plugin_opener`) are still registered but unused — §9.
