# Stewrd

A personal, cross-platform (Windows/macOS/Linux) desktop app whose functionality is delivered almost entirely by **hot-loadable plugins**. The host app is just a shell: a sidebar of installed plugins grouped by category, a main content area showing whichever plugin is selected, and a status bar for logs/errors. Plugins are trusted, unsandboxed JS/TS bundles that get full shell/filesystem/storage access through a host-provided API.

Built with **Tauri 2 (Rust backend) + React 19 + TypeScript + Zustand**, plugin bundles built with **esbuild**. One plugin (`claude-settings-editor`) is currently Windows-only (shells out to `powershell`) — the host itself is not.

> **Maintenance note for future readers (human or AI):** `claude.md` at the repo root points here as a good source of detail before starting work. This file is meant to be updated incrementally — when you add/change a host API, a Rust command, or a major mechanism, update the relevant section below in the same commit. Don't let this drift from the code; when in doubt, the source files linked in each section are the ground truth and this doc should be corrected to match them, not the other way around. Every claim below was verified against the source as of this writing — if you find one that no longer matches, fix it rather than assuming it's still close enough.

---

## 1. Orientation — where things live

```
stewrd/
  index.html                 host page shell; the generated <script type="importmap"> (see §5) is injected here
  src-tauri/
    tauri.conf.json           app identifier ("com.topher.stewrd" — this is part of the app-data path, see §3)
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
        logging.rs                rolling persistent log file (app-data/stewrd.log)
  src/                        React + TS host shell
    main.tsx                   React entry point
    host/
      layout/                  Sidebar, SidebarCategory, SidebarCategoryCollapsed, SidebarPluginItem, SidebarFooter, SettingsPage, categoryIcons, MainContent, StatusBar, StatusIcon
      loader/                  pluginDiscovery.ts, pluginLoader.ts, usePluginRegistry.ts
      scheduler/               tickScheduler.ts (+ its own unit tests)
      api/                     one file per PluginApi sub-surface (theme/modals/toast/shell/storage/fs/logging/statusIcon) + createPluginApi.ts which assembles them
      state/                   appStore.ts (zustand: plugins, activePluginId, statusLog, modals, toasts, categories, paletteId, customPalettes, palette (derived), sidebarCollapsed, view), hostSettings.ts (persists categories/theme via storage_get/set under a reserved "__host__" id)
      errors/                  PluginErrorBoundary.tsx, globalErrorHandlers.ts
      vendor-entries/          facade files used only to produce import-map targets for react/react-dom/tauri-api (see §5)
    shared/
      plugin-api.d.ts          the canonical PluginApi/PluginManifest/PluginContext/PluginModule TypeScript shape
      palette.ts               Palette + StatusColor + NamedPalette types, defaultPalette, premadePalettes (Dark/Light)
      category.ts              CategoryDef type, DEFAULT_CATEGORIES, resolveCategory (falls back to "Other")
    components/                Modal/, Toast/ — host-rendered singletons driven by api.modal/api.toast (not exposed as components); TextBox/, StatusDot/ — the actual `api.ui` components handed to plugins; MaskIcon/ — shared theme-tinted CSS-mask primitive used by category and plugin icons
  plugins/                   plugin source (dev-time location — see §3 "where plugins actually live at runtime")
    .stewrd/plugin-api.d.ts   hand-maintained flat copy of shared/plugin-api.d.ts as an ambient `declare module "stewrd-plugin-api"` for plugin-author editor type-checking only (not used at runtime)
    _template/                starter plugin — copy this folder to build a new plugin; demonstrates every API surface; has its own README.md (claude.md expects every plugin folder to have one — only _template does today)
    notepad/                  autosaving scratch pad (storage, debounced writes)
    claude-settings-editor/   edits ~/.claude/settings.json via shell (deliberately bypasses api.fs — see plugin's own comments); Windows-only (PowerShell)
    git-tracker/              background: true; polls a repo via Rust interval + JS tick; spawns `claude` headless
  scripts/
    stewrd-plugin-build.mjs           shared esbuild wrapper every plugin's build step calls (`npm run plugin:build -- <dir> [--watch]`)
    vite-plugin-react-importmap.ts    generates the host's <script type="importmap"> (see §5)
  docs/architecture-plan.md   the original design doc — much more verbose rationale/history than this file, including two rejected designs for plugin loading with reasons, and some *intended* behavior that never got implemented (this README calls those out explicitly where they matter — see §11)
  claude.md                   repo-root Claude instructions: commit+push directly to main when done, load this README for detail, each plugin folder should have its own README.md
```

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
  "version": "1.0.0",
  "category": "Utilities",
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
| `version` | Author's own semver, informational only. |
| `category` | Sidebar grouping. Must match a category id from the app-controlled list in Settings > Categories, or the plugin lands under "Other" until someone adds a matching category. |
| `icon` | Unused - reserved. Drop `icon.png` into the plugin's own folder to give it a sidebar icon instead - it's rendered as a CSS mask, tinted to the current theme color. |
| `entry` | Path to the **built** output the loader imports — always `dist/index.js`. You write `index.tsx`; esbuild produces this. |
| `description` | Shown in discovery-error messages/tooling. |
| `apiVersion` | Must equal the host's `SUPPORTED_API_VERSION` (currently `"1"`, see `src-tauri/src/commands/plugins.rs`) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at startup for off-screen work (pollers). `false` (default) = activate lazily on first sidebar selection. |

Validated with `serde` on the Rust side (parse + `apiVersion` equality only) — there is no frontend zod/schema validation in the code despite an earlier plan mentioning one.

A plugin can optionally drop a `settings.json` next to `plugin.json` — an array of `{ key, label, type, default, options }` fields — to get a configurable form for free in **Settings > Plugins**, backed by the plugin's own `ctx.api.storage` under those same keys. See `plugins/_template/README.md` for the schema and `plugins/_template/settings.json` for an example. Entirely optional; omit it if there's nothing to configure.

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
2. **Load** — `background: true` plugins are Blob-URL-imported immediately at startup; everything else is merely listed (so the sidebar shows it) and stays lazy until first selected (`usePluginRegistry.ensureLoaded`, triggered by `App.tsx` when `activePluginId` changes).
3. **Activate** — `activate(ctx)` runs once per load/reload. Register tick handlers and kick off startup work here. Note `statusIcon.set()` calls made here are a silent no-op for an eagerly-activated (`background: true`) plugin whose sidebar entry hasn't been populated into `appStore` yet — see §4.
4. **Mount/Unmount** — pure React, toggled by sidebar selection. Does **not** re-run activate/deactivate; a plugin's component can mount/unmount many times across one activation.
5. **Deactivate** — runs on hot-reload-replace or app shutdown. Order matters and is easy to get backwards: the plugin's own `deactivate()` runs first (fire-and-forget — its return value is **not** awaited, so an async `deactivate()` can still be running when the rest of teardown proceeds), then the host runs everything queued via `ctx.onDispose(fn)`, **then** aborts `ctx.signal`, **then** unregisters the tick handle (`destroyPluginContext` in `createPluginApi.ts`). Don't write an `onDispose` callback that assumes `ctx.signal` is already aborted — it isn't yet.
6. **Uninstall** — delete the folder; the next discovery pass removes and deactivates it if it was active (see hot-remove handling in `usePluginRegistry.ts`).

### Where plugins actually live at runtime

The `plugins/` folder at the repo root is the **dev-time source location** — each subfolder has source + its own `esbuild --watch`. Resolution order (`resolve_plugins_dir` in `commands/plugins.rs`):

1. `STEWRD_PLUGINS` env var (dev convenience — point this at the repo's `plugins/` folder while developing).
2. A `plugins` folder next to the running executable — this is the **portable, normal-use default** (e.g. `C:\Utilities\stewrd\plugins`). Created automatically if missing.
3. Per-user app-data plugins dir — **fallback only**, used if the exe's own folder isn't writable (e.g. a Program Files-style install without admin rights): `%APPDATA%\com.topher.stewrd\plugins` (Windows) / `~/Library/Application Support/com.topher.stewrd/plugins` (macOS) / `~/.local/share/com.topher.stewrd/plugins` (Linux). Everything else — `storage/`, `plugin-fs/`, `stewrd.log`, `boot-marks.json`, `disabled-plugins.json`, and the `SAFE_MODE` file (§4) — always lives under this app-data root regardless of which tier the plugins dir itself resolved to; only the plugin *code* location is affected by tier 2 vs 3. **If the identifier in `tauri.conf.json` ever changes, every app-data path in this doc moves with it.**

**Migration:** on startup, if the resolved plugins dir is empty and the old app-data plugins dir (tier 3) has folders in it, they're copied (not moved) into the new location once — see `migrate_legacy_appdata_plugins` in `commands/plugins.rs`. This only matters for installs that predate the portable-by-default change.

There is currently no third "read-only bundled examples" tier implemented — that was a stated possibility in the architecture doc but the code only implements the two tiers above.

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

Copy `plugins/_template/` wholesale, rename the folder, update `plugin.json`'s `id`/`name`/`category`. `plugins/_template/index.tsx` has a commented-out example of **every** API surface — uncomment what you need. `plugins/_template/README.md` covers the same manifest/lifecycle info as this section, kept in the template for a plugin author who never opens the main repo README — give your own new plugin folder a README too (`claude.md` expects one per plugin).

### Type-checking while authoring a plugin

`plugins/.stewrd/plugin-api.d.ts` declares an ambient `stewrd-plugin-api` module — a **hand-maintained flat copy** of `src/shared/plugin-api.d.ts`'s public shape (no cross-directory imports, so it works from any plugin folder standalone). Plugins reference it via a triple-slash directive:

```ts
/// <reference path="../.stewrd/plugin-api.d.ts" />
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
```

This is **editor-only** — plugins get no real module resolution back to the host at runtime; the actual `api` object arrives as a plain JS argument to `activate()`/`Component`. **If you change `src/shared/plugin-api.d.ts`, you must hand-update `plugins/.stewrd/plugin-api.d.ts` to match** — there's no generator (there's exactly one plugin author currently, so this wasn't worth automating).

---

## 4. Host reliability & lifecycle mechanisms

- **Boot safety (mark-before-run):** before Blob-URL `import()`, the loader calls `mark_plugin_attempt(pluginId)` which persists to `boot-marks.json` in app-data; the mark is cleared only after both `import()` and `activate()` succeed. On next launch, `reconcile_boot_marks` auto-disables (writes into `disabled-plugins.json`) any plugin still marked from the previous run — this catches a hang/crash during module evaluation itself, not just inside `activate()`. This is the *only* auto-disable mechanism — there's no separate N-failures counter.
- **Safe mode:** dropping a `SAFE_MODE` file directly in the **app-data root** (`is_safe_mode` in `commands/plugins.rs` checks `app_data_dir()/SAFE_MODE`, *not* inside the `plugins/` subfolder) makes `usePluginRegistry` skip loading anything. `App.tsx` shows a banner when active — the banner's own wording currently says "the app-data plugins directory", which is wrong in the same way this bullet is correcting; fix both together if you touch this.
- **Error isolation:** `PluginErrorBoundary` (`src/host/errors/PluginErrorBoundary.tsx`) wraps each mounted plugin's `Component`, catching render/lifecycle throws into an inline error card with a "Reload this plugin" button. This does **not** catch errors in event handlers, timers, or promise rejections — `registerGlobalErrorHandlers()` (`src/host/errors/globalErrorHandlers.ts`) installs `window.addEventListener("error"/"unhandledrejection")` listeners as a backstop, but **currently only `console.error`s them** — routing those into the status bar/persistent log with plugin attribution was planned but is not yet implemented.
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
| `api.toast` | `{ show({message, kind?, durationMs?}) }` | `host/api/toast.ts` + `components/Toast/ToastContainer.tsx` | Non-blocking, auto-dismisses after `durationMs` (default 3000ms). `kind` is a `StatusColor`, not free-form text — it's rendered by mapping straight to `palette.status[kind]`. Generation-guarded. |
| `api.ui` | `{ TextBox, StatusDot }` React components | `components/TextBox/`, `components/StatusDot/` | The *only* shared UI kit exposed to plugins — always use these instead of raw-importing from `src/components` (plugins have no module resolution back to host source anyway). `Modal`/`ToastContainer` are **not** part of `api.ui` — they're host-rendered singletons you trigger via `api.modal`/`api.toast` instead. |
| `api.shell` | `{ exec(cmd, args, opts?), spawn(cmd, args, opts?) }` | `host/api/shell.ts` → Rust `run_command`/`spawn_command`/`kill_command` in `commands/shell.rs` | **Arbitrary process execution, fully trusted, no allowlist.** `exec` awaits full output (`{code, stdout, stderr}`) — only rejects on spawn failure, non-zero exit is a normal resolved value. `spawn` streams `stdout`/`stderr` (batched ~30ms server-side) via Tauri events and returns `{pid, kill(), done}` — but note: `pid` reads `-1` until the underlying `invoke` resolves (calling `kill()` before then is a silent no-op), the output/exit listeners attach only *after* that resolution so very early output or an immediately-exiting process can race it, and `code` reads `-1` for a killed or code-less exit. **Nothing kills a spawned child automatically when the plugin deactivates** — that's on the plugin, via `ctx.onDispose(() => child.kill())`; none of the three shipped example plugins actually do this today (git-tracker's `claude -p` spawn, for instance, outlives deactivate/hot-reload and is only cleaned up at full app exit via `lib.rs`'s `RunEvent::Exit` handler). Always pass `program`/`args` separately — never build a shell string. Output is never auto-logged (may contain secrets). |
| `api.storage` | `{ get<T>(key), set<T>(key,val), getAll<T>() }` | `host/api/storage.ts` → Rust `storage_get`/`storage_set`/`storage_get_all` in `commands/storage.rs` | Per-plugin JSON file at `<app-data>/storage/<pluginId>.json` (see §3 for what `<app-data>` resolves to), auto-namespaced (you never construct the path). Writes are atomic (tmp-file + rename). **Plaintext on disk — no secrets.** |
| `api.fs` | `{ readTextFile(path), writeTextFile(path, contents), watchFile(path, onChange) }` | `host/api/fs.ts` → Rust `fs_read_text_file`/`fs_write_text_file` in `commands/fs.rs` | Raw file access **scoped to `<app-data>/plugin-fs/<pluginId>/`** — paths are resolved relative to that root and any path that would escape it (e.g. via `..`) is rejected server-side. Writes atomic (tmp+rename), but the tmp file is just the target path with its extension swapped for `.tmp` (`with_extension("tmp")`) — two concurrent writes to `notes.txt` and `notes.json` in the same plugin would stage through the same `notes.tmp` and can clobber each other; keep filenames distinct beyond their extension if you write concurrently. **`watchFile` is a documented no-op stub today** (`fs.ts` logs a warning and returns a no-op unsubscribe) — no plugin needs it yet; implement it if you become the first consumer. For access to files *outside* a plugin's own sandboxed folder (e.g. editing `~/.claude/settings.json`, as `claude-settings-editor` does), use `api.shell.exec` instead — that's the intended escape hatch. |
| `api.log` | `{ info(msg), warn(msg), error(msg) }` | `host/api/logging.ts` → Rust `append_log_line` | Writes to the in-memory ring buffer (`StatusBar`, capped at 500 entries) **and** a rolling persistent file `<app-data>/stewrd.log` (2MB cap, single-generation rotation to `.old`). `info` is stored/rendered at `StatusColor` level `"idle"` (grey), `warn` at `"warning"`, `error` at `"error"` — there's no separate "info" color. Generation-guarded. This is the only thing that reaches the log — shell/process output is never auto-logged. |
| `ctx.tick` | `{ register(fn), unregister(), requestWake(afterMs?), setInterval(ms\|null) }` | `host/scheduler/tickScheduler.ts` | See §7. `setInterval`/`requestWake` are inert until `register(fn)` has been called at least once — there's no handler to run otherwise. Runs while the plugin is loaded, independent of whether its Component is mounted — but throttled by the webview when the window is minimized/occluded (see §7's caveat, and the Rust-interval pattern below). |
| Raw `@tauri-apps/api/core` / `@tauri-apps/api/event` | `invoke`, `listen` | shared via the import map (§5), not part of `PluginApi` | Escape hatch for advanced plugins needing something beyond the standard surface — e.g. `git-tracker` calls `invoke("start_interval", ...)` / `listen("interval-tick:...")` directly (see below). Only use this for host-provided commands (the ones registered in `lib.rs`'s `invoke_handler!`); you cannot add new Rust commands from a plugin. Anything keyed by a plain string here isn't generation-scoped by the host — see §4's hot-reload ordering gotcha. |

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
 │   ├─ expanded: SidebarCategory.tsx[] (grouped by manifest.category resolved against appStore's categories, falling back to "Other") → SidebarPluginItem.tsx[] (indented, name + StatusIcon + optional plugin icon; click → setActivePlugin)
 │   ├─ collapsed: SidebarCategoryCollapsed.tsx[] (category icon via categoryIcons.ts, or ▸/▾ fallback) → icon-only SidebarPluginItem row per plugin
 │   └─ SidebarFooter.tsx (expanded: "Settings" + "<<"; collapsed: just ">>") — pinned to the bottom of the sidebar, height-matched to StatusBar's summary row
 └─ content column (flex: 1)
     ├─ MainContent.tsx → `view === "settings"` renders SettingsPage.tsx, else PluginErrorBoundary → <activePlugin.Component api={...} />
     └─ StatusBar.tsx (bounded 500-entry ring buffer + severity color; also persisted to app-data/stewrd.log; expanded log renders as an overlay above the fixed-height summary row, not by growing it) — spans only the content column's width, not the sidebar
Modal.tsx / ToastContainer.tsx — rendered once at app root, driven by appStore's modalQueue/toasts
```

- `usePluginRegistry()` (`host/loader/usePluginRegistry.ts`) is the single source of truth for discovered/loaded plugins; `App.tsx` feeds its `entries` into `appStore.setPlugins` for the sidebar, and calls `ensureLoaded(activePluginId)` when the user selects a plugin for the first time.
- `appStore` (`host/state/appStore.ts`, zustand) holds: `plugins` (sidebar entries + status + `dir`), `activePluginId`, `statusLog`, `categoriesExpanded`, `categories`, `paletteId`, `customPalettes`, `palette` (derived from the previous two, always resolves to a real `Palette`), `taskbarBadgeThreshold`, `hostSettingsLoaded`, `modalQueue`, `toasts`, `sidebarCollapsed`, `view` (`"plugin" | "settings"`). Plugins never touch this directly — only through the `PluginApi` surfaces in §6.
- The taskbar icon gets a small overlay "badge" dot (Windows only) when the worst status across every plugin (`host/layout/categoryStatus.ts`'s `worstStatus`, same error > warning > in-progress > success priority used for sidebar category tinting) reaches the user's configured threshold. `host/taskbarBadge.ts` renders the dot onto an off-screen canvas using the active palette's `status` color (so it stays theme-correct, never a hardcoded color) and calls Tauri's `Window.setOverlayIcon`; `App.tsx` recomputes it on every `plugins`/`taskbarBadgeThreshold`/`palette` change, guarded with a request-token ref so an in-flight async render can't clobber a newer one. Threshold is set in Settings > General (`off` / `success`-or-worse / `warning`-or-worse (default) / `error`-or-worse) and persists via `hostSettings.ts`.
- Category icons are **not** Vite-bundled - they're read at runtime from `<exe-dir>/assets/category-icons/` (a `<name>.png`) via the `list_category_icons` command (`commands/category_icons.rs`), so a user can drop in more icons after install without a rebuild. `src/assets/category-icons/` is only the dev-time source: `build.rs` copies it into `target/<profile>/assets/category-icons/` for `cargo run`/`tauri dev`, and `tauri.conf.json`'s `bundle.resources` copies it next to the exe for a packaged build - both land in the same exe-relative layout `category_icons.rs` reads from. `appStore.loadCategoryIcons()` fetches the list once at startup (and on demand via the "Refresh icon list" button in Settings > Categories); `host/layout/categoryIcons.ts` is just a pure `find`/`map` helper over that list. Which icon name a category uses is chosen in Settings > Categories, not inferred from the category name; categories with no icon assigned fall back to the ▸/▾ disclosure glyph in the collapsed sidebar.
- Categories are app-controlled (Settings > Categories, persisted via `hostSettings.ts`), seeded with `Other`/`Utilities`/`Templates`. A plugin's `manifest.category` must match a category's `id` or it's grouped under "Other" — adding a brand-new category to match a new plugin now requires a Settings edit, not just a manifest change.
- Plugin sidebar icons follow the same PNG convention as category icons, but scoped per-plugin and resolved differently: drop `icon.png` into the plugin's own folder (under the resolved plugins dir, not exe-relative); `get_plugin_icon` (`commands/plugin_icons.rs`) reads it by discovery `dir` and returns a data URL (`usePluginIcon.ts` fetches/caches per plugin `dir`).
- Both category and plugin icons render via `components/MaskIcon/MaskIcon.tsx`: a CSS `mask-image` (not `<img>`) tinted with `color` (default `currentColor`, i.e. whatever palette color the surrounding text already uses), so icons recolor live with the theme instead of keeping the source PNG's own baked-in colors. Trade-off: a mask flattens multi-color source art to one solid color, and only respects transparency the source PNG actually encodes.

### Settings (`SettingsPage.tsx` and siblings)

Four tabs, all in `host/layout/`:

- **General** (`SettingsGeneral.tsx`) — app name/version, plus the taskbar status badge threshold (see §8 above).
- **Categories** (`SettingsCategories.tsx`) — add/rename/delete categories and assign each one an icon (from `<exe-dir>/assets/category-icons/` - see §8). Renaming a category's display `name` is safe for existing plugins; its `id` (the value `manifest.category` must match) is fixed at creation. `Other` is built-in and can't be renamed or deleted.
- **Themes** (`SettingsThemes.tsx`) — pick a premade palette (`shared/palette.ts`'s `premadePalettes`: Dark/Light) or build a custom one (one color picker per `Palette` field) and save it. Selection persists via `hostSettings.ts` and applies live across the whole app and every plugin (`api.theme`).
- **Plugins** (`SettingsPlugins.tsx`) — lists every discovered plugin (including disabled/errored ones, via a direct `listPlugins()` call rather than `usePluginRegistry`, which filters disabled plugins out). Per plugin: activate/deactivate (`set_plugin_disabled`, now also emits `plugin-changed` so the toggle takes effect immediately instead of only on next restart), an inline settings form when the plugin ships a `settings.json` (values read/written through the plugin's own `ctx.api.storage`), and remove (`remove_plugin`, confirmed via `createModalApi()`, deletes the folder). An "Add plugin" file picker installs a `.zip`/`.tar`/`.tar.gz`/`.tgz` via `install_plugin_from_archive` (`commands/plugin_install.rs`) — no Tauri dialog plugin, the webview reads the picked file itself and hands the bytes over.

`General`/`Categories`/`Themes` persist through `hostSettings.ts`, a thin wrapper around the same `storage_get`/`storage_set` commands plugins use, namespaced under the reserved plugin id `"__host__"`. `Plugins` is different — it doesn't go through `hostSettings.ts` at all; it manages real plugin folders/state directly via the discovery/install/remove commands above, and per-plugin settings values are read/written through that plugin's own storage namespace, not the host's.

---

## 9. Rust backend surface (`src-tauri/src/`)

All commands are plain `#[tauri::command]` functions registered directly on the app's own `invoke_handler` — **deliberately not** `@tauri-apps/plugin-shell`/`plugin-fs`, because Tauri 2's capabilities/ACL system only scopes commands from *official* plugins (which require allowlisting each command+arg pattern — incompatible with "run anything the plugin author passes"). Commands on the app's own handler need no capability entry. This means `src-tauri/capabilities/` should stay essentially empty/minimal — don't reach for the official shell/fs plugins to "fix" this, it's intentional (see `commands/shell.rs`'s top comment and `docs/architecture-plan.md` §"Shell execution IPC flow"). The one exception is `core:window:allow-set-overlay-icon`, needed because the taskbar badge (§8) calls Tauri's own built-in `Window.setOverlayIcon` JS API, which — unlike the app's own commands — *is* gated by core ACL and isn't included in `core:default`.

| Command(s) | File | Purpose |
|---|---|---|
| `list_plugins`, `is_safe_mode`, `reconcile_boot_marks`, `mark_plugin_attempt`, `clear_plugin_attempt`, `set_plugin_disabled` | `commands/plugins.rs` | Discovery + boot-safety/disabled-list bookkeeping. Corrupt state files never brick boot — read failures log a warning and act as if empty. |
| `run_command`, `spawn_command`, `kill_command` | `commands/shell.rs` | Arbitrary process exec/spawn/kill. `spawn_command` tracks children in `AppState` for both normal kill and exit-time cleanup. |
| `storage_get`, `storage_set`, `storage_get_all` | `commands/storage.rs` | Per-plugin JSON KV store, atomic writes. |
| `fs_read_text_file`, `fs_write_text_file` | `commands/fs.rs` | Per-plugin scoped raw file access, atomic writes, path-escape rejection. |
| `start_interval`, `stop_interval` | `commands/interval.rs` | Rust-side `tokio::interval` heartbeat per string key, immune to webview timer throttling. |
| `append_log_line` | `commands/logging.rs` | Appends one JSON line to the rolling app-data log (2MB cap, one-generation rotation). |
| `get_plugin_icon` | `commands/plugin_icons.rs` | Reads a plugin's `icon.png` (by discovery `dir`, validated as a single path segment) and returns it as a data URL. |
| `list_category_icons` | `commands/category_icons.rs` | Lists every `<name>.png` in `<exe-dir>/assets/category-icons/` (resolved via `std::env::current_exe()`, not app-data) as data URLs. Both icon commands share a `read_as_data_url` helper in `commands/icon_util.rs`. |
| (none exposed to JS) | `commands/watcher.rs` | Started once in `lib.rs`'s `setup()`; watches the resolved plugins dir (1s debounce) and emits a fixed `"plugin-changed"` event with the affected directory name as its **payload** (not a per-plugin event name). The `Debouncer` handle is kept in `AppState.plugin_watcher` — dropping it silently stops delivery, so it must stay owned somewhere. |

Also still registered but unused by any `PluginApi` surface: the scaffold `greet` command and `tauri_plugin_opener` init in `lib.rs` — harmless leftovers from `npm create tauri-app`, safe to remove if you're cleaning up but not currently in anyone's way.

`state.rs` (`AppState`): owns the plugin watcher handle, `child_kill_senders` (normal runtime kill path) and `child_pids` (redundant, used only in the `RunEvent::Exit` handler in `lib.rs` — a synchronous OS-level `taskkill`/`kill` call, since by exit time there's no guarantee the tokio runtime is still scheduled to act on an async oneshot signal). This split exists specifically to fix a real bug (child processes like `ping`/`claude` surviving graceful app exit on Windows) — don't collapse it back into one mechanism without re-verifying that case.

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

For plugin dev, set `STEWRD_PLUGINS` to the repo's `plugins/` folder so `tauri dev` reads live source instead of the per-user app-data install location:

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
| `_template` | `false` | Every API surface, commented out. Not itself functional — copy-from scaffolding only. |
| `notepad` | `false` | `api.storage` for autosave with debounce; simplest real plugin. |
| `claude-settings-editor` | `false` | `api.shell.exec` (PowerShell + base64) to edit a file *outside* the plugin's own `api.fs` sandbox — the documented pattern for that case; JSON validation before save. **Windows-only** as written (hardcodes `powershell`/`$env:USERPROFILE`). |
| `git-tracker` | `true` | Eager background activation; the raw `invoke("start_interval"...)`/`listen("interval-tick:...")` escape hatch for minimize-proof polling (currently subject to §4's hot-reload ordering gotcha since it keys by a constant string, not generation); `ctx.tick` for lightweight UI-only refresh in parallel; `api.shell.spawn` streaming into a live-updating UI (asks a headless `claude -p` to summarize repo state) — its spawned `claude` process is not explicitly killed on deactivate (see §6's `api.shell` row). |

---

## 12. Known gaps / things not to assume are done

Keep this list current — remove an item once it's actually implemented, add new ones as they're discovered. Each item links back to the section with the full detail; don't duplicate the explanation here, just index it.

- `api.fs.watchFile` is a no-op stub — §6 (`api.fs` row).
- `registerGlobalErrorHandlers()` only `console.error`s, no status-bar/log routing or plugin attribution yet — §4.
- No frontend schema validation of `plugin.json` — only Rust's `serde` parse + `apiVersion` check — §3.
- No third "read-only bundled examples" plugin tier — only `STEWRD_PLUGINS` and per-user app-data are implemented — §3.
- `plugin.json`'s `icon` field is unused beyond accepting `"default"` — plugin sidebar icons come from an `icon.png` in the plugin's own folder instead, rendered as a theme-tinted CSS mask — §6 (`api.theme` row).
- Tick scheduler's watchdog only warns; it does not free up or recover a genuinely hung handler — §7.
- No plugin resource is auto-killed on deactivate beyond the tick handle and abort signal — spawned child processes in particular outlive deactivate/hot-reload until full app exit unless the plugin kills them itself — §2, §4, §6 (`api.shell` row).
- `deactivate()`'s return value isn't awaited during teardown, and `onDispose` callbacks run *before* `ctx.signal` is aborted, not after — §3 (Lifecycle step 5).
- Hot-reload activates the new plugin generation before tearing down the old one, which breaks any plugin keying a raw `invoke`-based resource by a constant string instead of by generation (current real example: `git-tracker`'s `start_interval`/`stop_interval` key) — §4.
- A throwing tick handler logs and calls `onError`, but does not set the plugin's status icon to `"error"` automatically — §6 (`api.statusIcon` row).
- Scaffold leftovers (`greet` command, `tauri_plugin_opener`) are still registered but unused — §9.
