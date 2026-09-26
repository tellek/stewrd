# Building a Stewrd plugin

This file ships inside every Stewrd install's `plugins/` folder so an AI coding
assistant opened here already knows how to build one. It's a condensed,
install-time version of the repo's `ARCHITECTURE.md` (also shipped, one level
up at `../ARCHITECTURE.md` — read it for full host internals, the plugin
sections here are the same information, just self-contained).

**Which context am I in?** If the folder *above* this one contains
`package.json` and `src-tauri/`, you're inside the Stewrd source repo, not a
real install — use `npm run plugin:build -- plugins/<id>` (the repo's own
build path, already wired into `build-release.bat`) and skip the standalone
build steps below entirely. Everything past this point assumes a real,
repo-less install (just `stewrd.exe`, `plugins/`, `assets/`, etc.).

## Start from the template

Copy `plugins/_template/` wholesale, rename the folder, and update
`plugin.json`'s `id`/`name` and `settings.json`'s `category`/`version` to
match. `_template/index.tsx` has a commented-out example of every API surface
below — uncomment what you need. `_template/README.md` covers the same ground
as this file with a live component-library coverage table; `_template/demos/`
has one file per UI component category.

## Host Integrations & Enforced Styles (Checklist)

Everything the host provides or enforces for a plugin. Look up the named
API/file before building anything that touches one of these.

**Sidebar & status indicators**
- Sidebar name: `plugin.json` `name`.
- Sidebar icon: drop `icon.png` in the plugin folder. It renders as a
  theme-tinted CSS mask (source colors ignored, transparency required). If
  it's missing, the host shows the fallback "more" icon. Idle tint is
  `palette.text` (`palette.accent` on hover) in the expanded sidebar and
  `palette.textMuted` in the collapsed rail.
- Sidebar icon alert/status color: `api.statusIcon.set(color, tooltip?)`
  recolors the whole sidebar icon (`idle | in-progress | success | warning |
  error`).
  - It's a silent no-op before the sidebar entry exists (early `activate()`
    in `background: true` plugins).
  - Status persists across hot-reload and the host never clears it. Call
    `statusIcon.set("idle")` in `activate()` (see `_template/index.tsx`).
  - A load/activate failure auto-sets `error` and the pane shows an error
    message.
- Category icon tint: the worst status among a category's plugins
  (error > warning > in-progress > success) tints the category icon
  automatically.
- Taskbar overlay dot (Windows): shows the worst status across all plugins
  once it reaches the Settings > General threshold. It's driven only by
  `statusIcon`.
- Tick watchdog: a tick handler hung for more than 30s sets status
  `warning`. A throwing tick is logged as an error but does not change the
  icon, so set `error` yourself.
- Sidebar sub-items: `api.sidebar.setItems([{ id, label, icon?, color?,
  onClick }])` / `setSelected(id)`.
  - `color` is a `StatusColor` dot. If you omit it, the host still draws a
    `textMuted` dot.
  - `setItems([])` hides them. They never render in the collapsed rail.
  - The host owns and persists the expand/collapse state.
- Sidebar category: the `settings.json` `"category"` value must match a
  Settings > Categories id or the plugin lands in "Other". Dragging a plugin
  to another category rewrites that key.
- Status bar: plugins get no direct slot. `api.log.info/warn/error` lines
  appear there (idle/warning/error colors) and in `stewrd.log`. Uncaught
  errors and unhandled rejections are routed there automatically.
- Toasts: `api.toast.show({ title?, message, kind?, durationMs? })`. `kind`
  maps to `palette.status`.
- Modals: `api.modal.error/info/question/confirm`. They're host-rendered and
  queued one at a time.
- Error boundary: a render throw shows an inline card with a "Reload this
  plugin" button.
- Settings > Plugins > Configure edits the plugin's `settings.json` as raw
  JSON.

**Pane container (forced by the host)**
- A plugin can render in more than one pane at once - dragging it onto a
  second pane opens an independent instance there (each gets its own
  `Component` mount/state), not a focus jump to the existing one. Sidebar
  single-click still just focuses an existing pane instead of opening a new
  one. Known limitation: `api.sidebar` state and `api.storage` are shared
  per-plugin-id, not per-pane-instance, so the most-recently-mounted instance
  "wins" for sidebar items/registrations, and storage keys can collide across
  instances - don't assume exactly one mounted `Component` per plugin.
  Reloading/hot-reloading one instance remounts every open instance of that
  plugin (they share one activation `generation`).
- The pane is a flex column with `padding: 16`, so don't add your own outer
  padding.
- The active pane gets a 2px `palette.accent` outline.
- With more than one pane open, a close "✕" button sits at the pane's
  top-right (`top: 4, right: 4`). Keep that corner clear.
- `Blanket`/`Drawer`/`InlineDialog` are scoped to the pane's content area.

**Styles**
- Colors: take them only from `api.theme.palette` (`background, surface,
  surfaceHover, text, textMuted, border, accent, status.*`). Use `subscribe`
  for live theme switches. Never use a literal hex.
- Title Case for all titles and button text.
- Use only `api.ui.*` components, never raw `<button>`/`<input>`/`<select>`.
  Check `_template/demos/` and `_template/index.tsx` for an existing example
  first.
- Buttons: `TextButton` / `IconButton` / `IconTextButton`, with
  `variant: "primary" | "secondary"`.
- Icons/images: pass `data:` URLs (`import` or `api.fs.readDataUrl`). Use
  `MaskIcon` for theme-tinted icons.
- `Banner.tone`: only `StatusColor | "accent" | "surface"`.
- Typography: inherit the host font (Inter stack, 16px / 24px line-height,
  `box-sizing: border-box`). Don't override it globally.
- Hover convention: text turns `palette.accent` and the background turns
  `palette.surfaceHover`.
- Scrollbars: the host pane is `overflow: auto` with an unstyled scrollbar.
  Make your root `flex: 1; minHeight: 0`, put `overflow: auto` on your own
  container, and style it with `scrollbarStyle(palette)` from
  `_template/demos/TextAreaDemo.tsx`.

**Runtime hooks & limits**
- `ctx.tick` handles scheduled work. It's throttled while the window is
  minimized.
- For work that must survive a minimized window, use Rust `start_interval` /
  `interval-tick:<key>` (see the `ctx.tick` row below). Key it by a
  per-activation value, not the plugin id: hot-reload runs the new
  `activate()` before the old `onDispose`, which would stop a shared key.
- Cleanup: use `ctx.signal` / `ctx.onDispose`. Spawned processes are not
  auto-killed.
- `api.statusIcon`/`log`/`toast`/`sidebar` throw after deactivation or
  hot-reload. Check `ctx.signal.aborted` before calling them from async
  callbacks.
- The only importable bare specifiers are `react`, `react-dom`,
  `react-dom/client`, `react/jsx-runtime`, `@tauri-apps/api/core` and
  `@tauri-apps/api/event`.
  - Other `@tauri-apps/api/*` imports build fine but fail at load.
  - Raw `invoke` reaches only host-registered commands. Plugins can't add
    Rust commands.
- Other surfaces:
  - `api.storage`: per-plugin JSON, no secrets.
  - `api.fs`: sandboxed to `data/`. `watchFile` is a no-op stub.
  - `api.shell`: pass the program and args separately, never a shell string.
  - `api.ai`: headless `claude` CLI.

## `plugin.json`

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "icon": "default",
  "entry": "dist/index.js",
  "description": "What this plugin does",
  "apiVersion": "1",
  "background": false
}
```

| Field | Meaning |
|---|---|
| `id` | Unique identifier; should match the folder name. Used for storage/fs namespacing, hot-reload matching, boot-safety marks. |
| `name` | Sidebar display name. |
| `icon` | Unused — reserved. Drop `icon.png` into the plugin's own folder for a sidebar icon instead; it renders as a theme-tinted CSS mask. |
| `entry` | Always `dist/index.js` — the **built** output. You write `index.tsx`; esbuild produces this. |
| `description` | Shown in discovery-error messages/tooling. |
| `apiVersion` | Must equal `"1"` (the host's current supported version) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at startup for off-screen work (pollers). `false` (default) = activate lazily on first sidebar selection. |

Optionally drop a `settings.json` next to `plugin.json` — a plain JSON object,
not a schema. The host only reads two keys: `"category"` (sidebar grouping —
must match a category id from Settings > Categories, else it lands under
"Other") and `"version"` (informational, shown in Settings > Plugins).
Everything else in the file is yours to define and read back via your own
`ctx.api.shell.exec`-based workaround if needed (there's no built-in way to
read your own custom settings keys at runtime otherwise). Example:

```json
{
  "category": "Utilities",
  "version": "0.1.0",
  "refreshSeconds": 30
}
```

Users edit this file via **Settings > Plugins > Configure** (raw JSON, not a
generated form). Omit the file entirely if you have nothing to configure.

## Plugin module contract

Your built `dist/index.js` must export:

```ts
interface PluginModule {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  Component: React.ComponentType<{ api: PluginApi }>;
}
```

The host renders `<mod.Component api={...} />` directly inside its own React
tree — your component gets hooks and behaves like any other component, even
though it was never bundled with the host.

## Lifecycle

1. **Discover** — the host scans `plugins/` for subfolders with a valid
   `plugin.json` + built `entry` file. A folder with no `plugin.json` is
   silently skipped; one with a `plugin.json` that fails to parse, has the
   wrong `apiVersion`, or is missing its built entry shows up as a discovery
   error instead.
2. **Load** — `background: true` plugins load immediately at startup;
   everything else stays lazy until first placed in a pane.
3. **Activate** — `activate(ctx)` runs once per load/reload. Register tick
   handlers and kick off startup work here.
4. **Mount/Unmount** — pure React, toggled by sidebar selection. Doesn't
   re-run activate/deactivate — your component can mount/unmount many times
   across one activation.
5. **Deactivate** — runs on hot-reload-replace or app shutdown, in this
   order: your `deactivate()` (fire-and-forget, not awaited) → your
   `ctx.onDispose(fn)` callbacks → `ctx.signal` aborted → your tick handler
   unregistered. Don't write an `onDispose` callback that assumes
   `ctx.signal` is already aborted — it isn't yet.
6. **Uninstall** — delete the folder; the next discovery pass removes it.

**Nothing is auto-cleaned up beyond the tick handle and abort signal** — a
plugin that spawns a process or opens a watch must clean it up itself (e.g.
`ctx.onDispose(() => child.kill())`).

## The `PluginApi` surface (what `ctx.api` gives you)

| Surface | Shape | Notes |
|---|---|---|
| `api.theme` | `{ palette, subscribe(fn) }` | Live-updating palette; restyle with it, never a literal hex. |
| `api.statusIcon` | `{ set(color, tooltip?), get() }` | Colored dot next to your sidebar entry. `color` is `"idle" \| "in-progress" \| "success" \| "warning" \| "error"`. |
| `api.modal` | `{ error(), info(), question(), confirm() }` | Blocking overlay dialogs, all return Promises. |
| `api.sidebar` | `{ setItems(items), setSelected(id) }` | Registers sub-items indented under your sidebar row (`{ id, label, icon?, color?, onClick }`). |
| `api.toast` | `{ show({title?, message, kind?, durationMs?}) }` | Non-blocking notification. |
| `api.ui` | `TextBox, StatusDot, MaskIcon, TextButton, IconButton, IconTextButton, Checkbox, RadioGroup, Toggle, Spinner, ProgressBar, Skeleton, Dropdown, DropdownCheckboxes, DropdownRadio, DropdownImageText, DropdownImageGrid, Tabs, Pagination, Menu, Link, Blanket, Drawer, InlineDialog, Banner, RangeSlider, Calendar, DatePicker, TimePicker, DateTimePicker, CodeTextArea` | The **only** UI kit — always use these instead of raw `<button>`/`<input>`/etc. Every one is palette-driven. See `_template/demos/` for a live example of each. |
| `api.shell` | `{ exec(cmd, args, opts?), spawn(cmd, args, opts?) }` | Arbitrary process execution, no allowlist. `exec` awaits full output; `spawn` streams. Always pass `program`/`args` separately, never a shell string. |
| `api.storage` | `{ get<T>(key), set<T>(key, val), getAll<T>() }` | Per-plugin JSON key/value store. Plaintext — no secrets. |
| `api.fs` | `{ readTextFile, writeTextFile, readDataUrl, listDir, getRootPath, deleteFile, renameFile, watchFile }` | Raw file access scoped to your plugin's own sandboxed folder (`watchFile` is currently a no-op stub). For files *outside* your sandbox (e.g. editing a dotfile in the user's home dir), use `api.shell.exec` instead. |
| `api.log` | `{ info(msg), warn(msg), error(msg) }` | Writes to the status bar and a persistent log file. |
| `api.ai` | `{ run(prompt, opts?) }` → `{ pid, kill(), done }` | Launch point for headless `claude` CLI invocations. |
| `ctx.tick` | `{ register(fn), unregister(), requestWake(afterMs?), setInterval(ms\|null) }` | Scheduled work while your plugin is loaded (independent of whether it's mounted). Throttled when the window is minimized — for background work that must survive that, use the raw escape hatch instead: `invoke("start_interval", { key, intervalMs })` (clamps to >= 1000ms) + `listen("interval-tick:" + key, fn)`, and `invoke("stop_interval", { key })` in `ctx.onDispose`. |
| Raw PTY (no `api.*` wrapper) | `invoke("pty_spawn", { id, program, args, cwd?, env?, cols, rows })`, `invoke("pty_write", { id, data })`, `invoke("pty_resize", { id, cols, rows })`, `invoke("pty_kill", { id })` | A real interactive terminal (resize, ANSI escapes) via `portable-pty`, for plugins needing more than `api.shell`'s piped output — e.g. an in-app shell. **You generate `id` yourself** (a UUID) and must `listen("pty-output:" + id, fn)` / `listen("pty-exit:" + id, fn)` **before** calling `invoke("pty_spawn", ...)` — output starts flushing within ~16ms, so listening first is required, not just best practice, or early events (batched output, or a fast-exiting process's `pty-exit`) are silently dropped. `pty-exit` fires once with `{ code }`, after all output has flushed. Reusing an `id` that's still live makes `pty_spawn` reject. **On Windows, the terminal writes a cursor-position query (`ESC[6n`) on startup and won't render further output until you write back `ESC[<row>;<col>R` via `pty_write`** — a real terminal emulator (xterm.js) does this for you automatically via its `onData`; anything else reading `pty-output` directly must answer it itself. Kill on deactivate yourself (`ctx.onDispose(() => invoke("pty_kill", { id }))`) — nothing does it for you, same as `api.shell.spawn`. |

Icon/image props (`IconButton.icon`, etc.) take a `data:` URL: use
`import icon from "./assets/foo.png"` for a bundled asset (esbuild inlines it
as base64), or `api.fs.readDataUrl(path)` for a runtime file. A raw relative
path never resolves — plugin bundles load from a Blob URL, not a file: URL.

## Building

You write `index.tsx` (or `.ts`/`.jsx`/`.js`); it must be built into
`dist/index.js` before the host will load it. From inside your plugin's own
folder, one-time setup then build:

```sh
cd plugins           # this folder
npm install esbuild  # once, creates plugins/node_modules + plugins/package.json
node build-plugin.mjs my-plugin           # one-shot build
node build-plugin.mjs my-plugin --watch   # rebuild on save; the host hot-reloads automatically
```

Requires [Node.js](https://nodejs.org/) — install it first if `npm`/`node`
aren't recognized. `build-plugin.mjs` bundles your entire file tree into a
single ESM file; `react`/`react-dom` (all subpaths, including
`jsx-runtime`) and `@tauri-apps/api/*` are left external since they resolve
at runtime against the host's own instances — don't bundle a second React.

## Type-checking while authoring

`.stewrd/plugin-api.d.ts` (a sibling of this file) declares an ambient
`stewrd-plugin-api` module for editor autocomplete/type-checking only — it's
never loaded at runtime. Reference it from your `index.tsx`:

```ts
/// <reference path="../.stewrd/plugin-api.d.ts" />
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
```

## Sharing a plugin

Plugins are portable: zip up a plugin's folder (including its built `dist/`)
and hand it to someone else, or install it via **Settings > Plugins > Add
plugin** (`.zip`/`.tar`/`.tar.gz`/`.tgz` supported).
