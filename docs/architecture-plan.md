# Stewrd — Plugin-Based Desktop App: Initial Architecture & Scaffold

## Context

Topher wants a Windows/Mac/Linux desktop app whose functionality is almost entirely delivered by plugins: a sidebar of installed plugins (grouped by collapsible category), a main content area showing whichever plugin is selected, and a status bar for debug/errors. Plugins are self-contained folders that can hook into shared app resources (theme, modals, toasts, textbox, a status icon, shell execution) and register work on a shared "tick" loop instead of each spinning up their own thread. The repo (`C:\Unreal Projects\stewrd`) is currently empty (only `.git`/`.remember`/`.serena`), so this is a from-scratch scaffold.

Decisions already locked in with Topher (do not revisit):
- **Framework**: Tauri (Rust backend + webview). Shell/OS work happens via Tauri commands in Rust, never directly from the webview.
- **Frontend**: React + TypeScript.
- **Plugins**: JS/TS with a `plugin.json` manifest, loaded dynamically at runtime — no recompile needed to add a plugin.
- **Trust model**: fully trusted plugins, no sandboxing/permission scoping (personal power-tool, not a marketplace).
- **Plugin UI**: same-window React component (no iframes).
- Additionally requested mid-session: a **template/starter plugin** demonstrating every host API hookup and UI piece, for new plugins to copy from.

Toolchain check confirms Node v22.18.0, npm 10.9.3, Rust/cargo 1.96.0 are installed, so Tauri 2.x scaffolding is viable immediately.

## Project structure

```
stewrd/
  src-tauri/                      # Rust backend
    src/
      main.rs
      lib.rs                      # app builder, command registration
      commands/
        shell.rs                  # run_command / spawn_command / kill_command (custom commands, not tauri-plugin-shell)
        plugins.rs                # plugin discovery: reads plugins/*/plugin.json + dist/index.js, storage read/write (not tauri-plugin-fs)
      state.rs                    # AppState: running child processes keyed by generated id
      events.rs                   # typed emit helpers (process-output/process-exit, plugin-changed)
    capabilities/                 # Tauri 2 ACL config — only needed for official plugins actually used (e.g. fs access scoped to app-data for storage); shell.rs/plugins.rs are custom app commands and need no capability entries (see "Shell execution IPC flow")
    tauri.conf.json               # no asset-protocol scoping needed for plugin loading (plugin source is read by a custom command and delivered as a Blob URL, not served via the asset protocol — see "Plugin loading mechanism"); no CSP needed by default (Tauri 2's default is unset)
  src/                             # React + TS frontend (host shell)
    host/
      layout/        Sidebar.tsx, SidebarCategory.tsx, SidebarPluginItem.tsx, StatusIcon.tsx, MainContent.tsx, StatusBar.tsx
      loader/         pluginDiscovery.ts, pluginLoader.ts, pluginRegistry.ts   # loader imports prebuilt dist/index.js per plugin; no in-app transpile step
      scheduler/       tickScheduler.ts
      api/             createPluginApi.ts, theme.ts, modals.ts, toast.ts, shell.ts, storage.ts, statusIcon.ts, logging.ts
      state/           appStore.ts   (zustand: plugins, activePluginId, statusLog, categoriesExpanded, palette)
    shared/
      plugin-api.d.ts  # PluginApi/PluginManifest/PluginModule/TickHandle types
      palette.ts       # palette tokens + StatusColor enum
    components/        Modal/, Toast/, TextBox/, StatusDot/   (shared UI kit, exposed to plugins via api.ui, not raw import)
  plugins/
    _template/                    # starter plugin — see "Template plugin" section below
    notepad/
    claude-settings-editor/
    git-tracker/
```

The repo-root `plugins/` tree shown above is the **dev-time source location** (each subfolder has plugin source + its own `esbuild --watch` producing `dist/`); it is not where the running app looks at runtime. See "Plugin directory resolution" below for the real runtime location and how dev mode points at this repo folder instead via `STEWRD_PLUGINS`.

`shared/plugin-api.d.ts` types are not imported at runtime by plugins (plugins get no npm/module resolution to the host's TS source) — instead the loader generates an ambient `.d.ts` reference inside `plugins/.stewrd/` that plugin authors reference via a triple-slash directive for editor type-checking only; at runtime plugins receive the actual `api` object as a function argument.

## Plugin loading mechanism (highest-risk part — build and validate first)

**REVISED THREE TIMES after review.** Round 1 found the original design (esbuild-wasm + Blob URL dynamic import) couldn't support relative imports at all. Round 2 (adversarial) found the round-1 fix (a custom `stewrd-plugin://` URI scheme + Rust-native SWC live transpilation) had its own serious, largely disqualifying problems — see "Why the custom-scheme/live-transpile approach was rejected" below. Round 3 found that round 2's fix, as first written, still had a fatal flaw: Tauri's asset protocol is **not** actually same-origin with the app's own page (it's `asset://localhost`/`http://asset.localhost` vs. the app's `tauri://localhost`/dev-server origin — a real, documented cross-origin split), which would have broken the import map the instant a plugin tried to resolve `"react"` back to the host's origin. **Final approach: each plugin is a small esbuild-bundled ESM package, loaded via a same-origin Blob URL, resolved against a native import map on the host document.** Topher confirmed a small per-plugin build step is an acceptable trade to eliminate these risks.

**Approach:**

1. Each plugin folder contains its own source (`index.tsx` etc.) plus a minimal `esbuild` config the host provides as a shared helper script (`stewrd-plugin-build --watch`, a thin wrapper so plugin authors don't hand-write esbuild config). It bundles the plugin's entire file tree — so all of the plugin's own relative imports are resolved and inlined **at build time**, not at runtime — into a single `dist/index.js` ESM file, with `react`, `react-dom`, and their subpaths (`react/*`, `react-dom/*` — a plain `external: ['react','react-dom']` does **not** catch subpath specifiers like `react/jsx-runtime`, which modern JSX-automatic-runtime output uses) marked `external` so they remain as bare import specifiers in the output rather than being bundled or inlining React internals by accident.
2. Rust `list_plugins` command enumerates `plugins/*/plugin.json` under the resolved plugin directory (see "Plugin directory resolution" below), reads each plugin's already-built `dist/index.js` as text, and returns both the manifest and that source text to the frontend — skipping (with a status-bar error) any plugin missing a built output or with a malformed manifest.
3. **The frontend loads the plugin via a Blob URL, not a fetch from any server-backed origin**: `URL.createObjectURL(new Blob([distSource], {type:'text/javascript'}))`, then `await import(blobUrl)`. A Blob URL's module realm is the *document's own realm* — it is genuinely same-origin with the host page, unlike Tauri's asset protocol (which is a distinct origin from the app page, verified as a real cross-origin split, not a same-origin convenience as round 2 assumed). Since the plugin is a single fully-bundled file with zero runtime-relative sub-imports (all inlined at build time in step 1), the reason round 1 rejected Blob URLs — non-hierarchical base URLs breaking relative imports — no longer applies; only bare specifiers (`react`, resolved via the import map below) remain, and those resolve against the *document's* import map regardless of the blob's own non-hierarchical base URL.
4. **React sharing uses a native browser `<script type="importmap">`** in the host's own `index.html`, mapping `"react"`, `"react-dom"`, `"react-dom/client"`, and `"react/jsx-runtime"` (plus `"react/jsx-dev-runtime"` in dev builds) to the host's own React output. Because Vite hashes dependency filenames and serves pre-bundled deps at cache-busted paths, the import map's targets are generated at build time by a small Vite plugin (writing the actual resolved URLs into `index.html`) rather than hand-written — there is no stable static path to point at otherwise. Import maps work reliably for same-origin module URLs in both WebView2 and WKWebView (the earlier "import maps are unreliable" conclusion only applied to `blob:`-loaded *relative* imports, which don't exist in this design — the import map itself, being realm-scoped, still applies to bare specifiers inside a blob-loaded module).
5. Hot reload no longer needs any cache-busting query-param scheme: since every reload creates a **new** Blob URL (and the previous one is explicitly revoked after teardown), each reload is trivially a distinct module by construction — the sticky-per-realm ES module cache problem that broke query-param cache-busting under the live-transpile design doesn't arise here.
6. **No npm installs at plugin-authoring time beyond what the plugin author's own `esbuild` bundles** — a plugin wanting a third-party library adds it as a normal devDependency in its own folder and lets esbuild bundle it in (still fully offline/local, no host-side module resolution needed at runtime since everything except React is already inlined).
7. Plugin module contract (unchanged):
   ```ts
   interface PluginModule {
     activate(ctx: PluginContext): void | Promise<void>;
     deactivate?(): void | Promise<void>;
     Component: React.ComponentType<{ api: PluginApi }>;
     // tick handlers are registered inside activate() via ctx.tick, not a separate export
   }
   ```
   Host renders `<mod.Component api={...} />` directly in its own tree — never mounts the plugin as a separate React root.
8. **Hot reload**: the plugin author's own `esbuild --watch` rebuilds `dist/index.js` on save (giving real source maps, since esbuild's own sourcemap output is used directly — no separate transpile step to lose fidelity). A Rust `notify-debouncer-full` watcher (not raw `notify` — editors fire multiple Modify/Create events per save; a debouncer with a ~1s window, the same pattern Tauri's own CLI uses, avoids double-reloads) watches for changes to `dist/index.js` specifically and emits a `plugin-changed` event (own the watcher instance in managed state so it isn't dropped, which silently stops delivery). Frontend re-reads the new source via `list_plugins`/a targeted re-read command and re-runs steps 2–3 for just that plugin (deactivate → unregister tick → unmount → revoke old Blob URL → create new Blob URL → reload → activate → remount).

**Why the custom-scheme/live-transpile approach was rejected** (adversarial review findings, verified against Tauri/WebKit docs before being accepted):
- Tauri custom-scheme URLs are **not** `scheme://path` on Windows/Android — they resolve to `http://<scheme>.localhost/<path>`. The round-1 plan's literal `stewrd-plugin://...` string would have failed immediately on the primary target platform.
- ES module `import()` is always a CORS-mode fetch; a custom-scheme origin serving plugin code is cross-origin from the app's own origin, requiring explicit CORS headers the round-1 plan never accounted for, and WebKit has documented additional restrictions (including opaque-origin treatment and reports of custom-scheme script content causing web-process termination in some WebKit versions).
- The ES module specifier map is permanent per page realm **by spec** — "cache-bust only if the cache proves sticky" was not a real option, it's always sticky. And once a cache-busting query param is added to the entry URL, relative child-module URLs from live per-file serving do not inherit it, so the exact "multi-file plugin hot-reloads correctly" case the round-1 fix was built to solve would not have actually worked. Bundling to one file (this version) removes the problem instead of needing to solve it.
- Rust-native SWC integration for TSX transform + import-specifier rewriting is real, non-trivial compiler infrastructure (parser + resolver + JSX transform passes + a custom specifier-rewriting AST visitor), effectively relocating the original "too much custom infrastructure" problem from JS to Rust rather than eliminating it — and would still need to solve source-map fidelity and TypeScript `isolatedModules`/`export type` semantics from scratch.
- Net effect: prebuilt ESM (already identified as the lowest-cost fallback in round 1) removes all of the above simultaneously, in exchange for a one-time-per-plugin `esbuild --watch` process — accepted as worthwhile given Topher is currently the only plugin author.

**A third review pass then found the first version of the prebuilt-ESM fix (round 2) still had a fatal flaw, since fixed:** it assumed Tauri's asset protocol was "same-origin" with the app's own page well enough for an import map to bridge a plugin (served from the asset origin) back to the host's React (served from the app's own page origin). That's factually wrong — Tauri's asset protocol is a **separate, documented origin** (`asset://localhost` / `http://asset.localhost` vs. the app's `tauri://localhost` or dev-server origin), so the plugin's `"react"` import would have been a genuinely cross-origin module fetch that Tauri's asset responses aren't configured to allow. The fix (reflected in steps 2–5 above): load the plugin bundle via a same-origin **Blob URL** instead of fetching it from the asset-protocol origin — a Blob URL's module realm is the document's own realm, so the import map (which is realm-scoped, not base-URL-scoped) still applies correctly to the plugin's bare `react` specifier even though the module itself came from a blob. This works now specifically because the plugin is a single, fully-bundled file with no relative sub-imports — the reason blob URLs were rejected in round 1.

**Remaining architectural risks, carried forward regardless of loading mechanism:**
- No sandboxing means a throwing `activate()`/render can still crash the app — mitigated with a `PluginErrorBoundary` per mounted plugin (isolates render/lifecycle errors to an inline error card + status bar log + auto-red status icon) **plus global `window.onerror`/`unhandledrejection` handlers with plugin attribution**, since React error boundaries do not catch errors in event handlers, timers, or promise rejections — the majority of real plugin bugs. The boundary needs an explicit "reload this plugin" recovery action, not just a static error card.
- **Boot safety must handle a plugin that hangs on its very first load, not just one that throws N times — and the mark must be written before `import()`, not before `activate()`.** A pure failure-counter approach (increment on caught exception, disable after N) misses synchronous infinite loops and doesn't help on the very first crash; and if the hang happens during module evaluation itself (a top-level infinite loop in the plugin bundle), marking only before `activate()` is too late to catch it. Use a **mark-before-run** pattern instead: persist "attempting to load plugin X" to app-data (written and awaited/flushed) *before* calling `import()` on that plugin's Blob URL, and clear the mark only after both import and `activate()` succeed; on the next launch, any plugin still marked from the previous run is auto-disabled (N=1, not N consecutive failures). This is the only boot-safety mechanism in the plan — there is no separate failure-counter mechanism to reconcile it with. The disabled-state read itself must be wrapped in try/catch defaulting to "disable nothing but log a warning" — a corrupt state file must never itself brick boot. Since a user launching by double-clicking can't pass a `--safe-mode` flag, also support a simple sentinel/marker (e.g., holding Shift at launch, checked via a short initial delay before eager activation begins, or a `SAFE_MODE` file dropped in app-data) as a manual escape hatch. Only plugins whose manifest declares they need eager background activation (`"background": true`, for something like Git Tracker) are activated at startup; everything else activates lazily on first sidebar selection, shrinking the blast radius of eager activation to only the plugins that actually need it.
- **`ctx.onDispose` and "the api object throws after deactivation" are enforcement aids, not guarantees** — an in-flight `api.shell.exec()` promise created before deactivation still resolves after it and its `.then` will run, and a plugin can still capture references before teardown. Mitigate with a **generation token**: every `PluginContext`/`PluginApi` instance is tagged with the plugin's current activation generation, and the host drops results/events carrying a stale generation rather than delivering them; additionally give plugins a real `ctx.signal: AbortSignal` that's aborted on deactivate, so async work can opt into cancellation (e.g. pass it to `fetch`/long-running loops) instead of relying on the plugin author remembering to check an `isActive` flag manually.

## Plugin directory resolution

Decided now (not deferred to packaging) because it constrains the loader, the fs watcher, and which directory the asset-serving scope covers:
- Resolution order: `STEWRD_PLUGINS` env var override (dev convenience) → a per-user, writable app-data plugins directory (`%APPDATA%/stewrd/plugins` on Windows, `~/Library/Application Support/stewrd/plugins` on macOS, `$XDG_DATA_HOME/stewrd/plugins` or `~/.local/share/stewrd/plugins` on Linux) → a read-only bundled `plugins/` shipped alongside the app for built-in examples.
- "Next to the executable" (the original assumption) is rejected: on macOS that's inside the signed `.app` bundle (not user-writable, breaks signing if written to); on Linux it's typically a system path like `/usr/bin`; in `tauri dev` it resolves to `src-tauri/target/debug/`, not the repo root. The per-user app-data directory is writable on all three platforms and is where a user-installed plugin folder should actually live.

## Plugin manifest & lifecycle

`plugin.json`:
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
`entry` points at the plugin's **built** output (produced by the plugin's own `esbuild --watch`, per the loading mechanism above) — plugin authors write `index.tsx`, but the manifest always references the compiled `dist/` artifact the loader actually imports. Validated via a zod schema on the frontend (Rust only does existence/parse). `apiVersion` is a simple integer/semver gate against the host's supported plugin-API version, checked at discovery time — added now rather than retrofitted later. `background` (default `false`) declares whether this plugin needs eager activation at startup for off-screen work (e.g. Git Tracker's polling); everything else activates lazily on first sidebar selection.

Lifecycle: **Discover** (startup + fs-watch) → **Load** (read + Blob-URL-import all discovered, non-disabled plugins whose manifest sets `background: true`, immediately; everything else deferred until first selected) → **Activate** (`activate(ctx)` once per session; registers tick handlers) → **Mount/Unmount** (pure React, toggled by sidebar selection, does not re-activate/deactivate) → **Deactivate** (on hot-reload-replace or shutdown; runs the plugin's disposal bag — see below) → **Uninstall** (folder deleted → next discovery pass removes and deactivates if active).

Boot safety (mark-before-run, see "Remaining architectural risks" above) is the single mechanism governing auto-disable — there is no separate failure-counter mechanism.

**Resource cleanup**: plugins get a disposal bag on their context (`ctx.onDispose(fn)`) for anything they register outside the tracked APIs (raw DOM listeners, extra timers). The host also auto-revokes everything it handed out through the tracked APIs (tick registrations, fs watchers, spawned child processes) on deactivate, and makes the `api` object itself throw if called after deactivation, so a lingering async callback fails loudly instead of mutating live state after teardown. This matters most for hot reload during development, where dozens of reload cycles would otherwise leak pollers/watchers one at a time.

## Tick scheduler

Goal: zero registered tick work → zero timers/zero CPU; responsive when something is due. **Simplified after review** — a min-heap and a separate rAF path were premature complexity for a personal tool expected to run well under 20 plugins, and rAF is the wrong tool for non-painting background work (it also stops entirely when the window is hidden/minimized, which is exactly when Git Tracker-style polling still needs to run).

- API given to plugins: `register(fn)`, `unregister()`, `requestWake(afterMs?)` (one-off), `setInterval(ms|null)` (recurring).
- Central scheduler keeps registered handlers in a plain array sorted (or linearly scanned — identical in practice at this scale) by next-due-time, and sleeps in a single `setTimeout` sized to the nearest deadline, recomputed after each fire. No plugin work due = no timers at all. No rAF path in v1 — nothing in the described plugins needs sub-20ms cadence, and it can be added later if a real need appears.
- Use `performance.now()` for all interval math, not wall-clock time — wall clock is vulnerable to catch-up storms after system sleep or an NTP step.
- **Known limitation, stated explicitly rather than papered over**: WebView2/WKWebView throttle `setTimeout` (often to ≥1s) when the window is hidden, minimized, or occluded, so a plugin's "check every 60s" is not a hard guarantee while the app isn't focused. If a plugin's background work must run reliably regardless of window state (this matters most for Git Tracker), the correct mechanism is a Rust-side `tokio::interval` that emits a Tauri event to trigger that plugin's check — document this as the pattern for "must survive minimization" cases rather than pretending the JS-side scheduler can guarantee it.
- Overlap handling, precisely defined (found under-specified in review): if an async handler is still running when its next interval fires, the scheduler coalesces — it does not queue a second concurrent invocation — and the **next deadline is anchored to completion time**, not the original start time, so a slow handler naturally self-throttles instead of drifting into permanent back-to-back execution.
- **Watchdog timeout**: a handler whose returned promise never settles (e.g. a network call that hangs) must not silently disable that plugin's polling forever with no signal — the scheduler enforces a per-handler timeout (configurable, sane default e.g. 30s), and a handler that exceeds it is logged as a warning with that plugin's status icon set to warning, then the next scheduled invocation proceeds normally rather than waiting on the hung one indefinitely. This matters specifically for Git Tracker-style network polling.
- **Reentrancy**: registering or unregistering a handler *from within* a handler currently executing (including a plugin unregistering itself, or the scheduler ticking during teardown) must not corrupt the in-progress scan — mutations during a scheduler pass are queued and applied after the current pass completes, not applied in place.
- **Timer overflow guard**: `setTimeout` clamps at 2^31−1 ms; a `null`/far-future next-due-time must be treated as "no active timer" rather than passed directly to `setTimeout`, which would otherwise overflow and fire immediately in a busy loop.
- Per-invocation try/catch: a throwing tick handler logs to the status bar and sets that plugin's status icon to error, without killing the scheduler for other plugins.
- Lives as a singleton in `src/host/scheduler/tickScheduler.ts`, framework-agnostic (no Tauri/React dependency) so it's unit-testable standalone — the overlap/watchdog/reentrancy/overflow behaviors above are exactly the kind of thing a small standalone unit-test suite should cover directly, independent of any plugin. Given the earlier simplification (no min-heap, no rAF), this doesn't need its own dedicated spike milestone — fold its build + tests into the same milestone as the core API surface, and let Git Tracker (the real recurring-background-work plugin) be its end-to-end stress test.

## Shared plugin API (author-facing shape)

```ts
export type StatusColor = 'idle' | 'in-progress' | 'success' | 'warning' | 'error';

export interface PluginContext { api: PluginApi; tick: TickHandle; pluginId: string; signal: AbortSignal; }
// `signal` is aborted by the host on deactivate, so a plugin can pass it into fetch()/long-running
// loops to opt into real cancellation, instead of relying only on manual isActive-flag checks.

export interface PluginApi {
  theme: { palette: Palette; subscribe(fn: (p: Palette) => void): () => void };
  statusIcon: { set(color: StatusColor, tooltip?: string): void; get(): StatusColor };
  modal: {
    error(opts: {title:string; message:string}): Promise<void>;
    info(opts: {title:string; message:string}): Promise<void>;
    question(opts: {title:string; message:string; buttons:string[]}): Promise<string>;
    confirm(opts: {title:string; message:string; confirmLabel?:string; cancelLabel?:string}): Promise<boolean>;
  };
  toast: { show(opts: {message:string; kind?:StatusColor; durationMs?:number}): void };
  ui: { TextBox: React.ComponentType<TextBoxProps>; StatusDot: React.ComponentType<{color:StatusColor}> };
  shell: {
    exec(cmd:string, args:string[], opts?:{cwd?:string; env?:Record<string,string>}): Promise<{code:number; stdout:string; stderr:string}>;
    spawn(cmd:string, args:string[], opts?:{cwd?:string; env?:Record<string,string>; onStdout?:(c:string)=>void; onStderr?:(c:string)=>void}): {pid:number; kill():void; done:Promise<{code:number}>};
  };
  storage: { get<T>(key:string):Promise<T|undefined>; set<T>(key:string,value:T):Promise<void>; getAll<T extends Record<string,unknown>>():Promise<T> }; // auto-scoped per plugin id
  fs: { readTextFile(path:string):Promise<string>; writeTextFile(path:string,contents:string):Promise<void>; watchFile(path:string,onChange:()=>void):()=>void };
  log: { info(msg:string):void; warn(msg:string):void; error(msg:string):void };
}
```
`storage` and `fs` are namespaced under the plugin's own app-data folder automatically — plugin authors never construct the path themselves. `storage.set` writes are implemented as atomic tmp-file-then-rename on the Rust side (not a naive overwrite), since Notepad's autosave plus a tick loop writing on the same file is a realistic day-one path to a torn/corrupted JSON file. `storage` is plaintext JSON on disk — documented as such, so plugin authors know not to put secrets in it.

## Shell execution IPC flow

1. Plugin calls `api.shell.exec(...)` / `api.shell.spawn(...)`.
2. Frontend `invoke('run_command', {...})` (awaited case) or `invoke('spawn_command', {...})` (streaming case, returns a `processId` immediately).
3. Rust: `run_command` uses `tokio::process::Command::output()`, returns `{code, stdout, stderr}`; spawn failures reject the promise with a readable error. `spawn_command` stores the `Child` in `AppState`, streams stdout/stderr via `app_handle.emit("process-output:<id>", ...)` **batched/coalesced into ~16–50ms windows** rather than one event per line (a chatty `claude`/`git` process emitting per-line events would flood the IPC bridge and jank the UI), emits `process-exit:<id>` on completion, and cleans up `AppState`.
4. Frontend `spawn()` wraps this into `{pid, kill(), done}`, wiring `onStdout`/`onStderr` to Tauri event listeners and cleaning up listeners after exit.
5. Convention: `exec()` only rejects on spawn failure — a non-zero exit code is a normal resolved value (`{code, stdout, stderr}`), not a thrown error, so plugin authors check `code` themselves (matches Notepad/Git Tracker calling `claude` headless and needing to inspect exit codes).
6. **These are custom `#[tauri::command]` functions, not `@tauri-apps/plugin-shell`.** This distinction matters: Tauri 2's ACL/capabilities system only scopes commands registered by *plugins* (like the official shell plugin, which requires allowlisting each command name + arg regex — structurally incompatible with "run anything the plugin author passes"). Commands registered directly via the app's own `invoke_handler` are, by default, callable by the app's webviews with no capability entry required. This is confirmed as the intended pattern for apps that want a fully-trusted shell surface (the community `tauri-plugin-shellx` exists for exactly this reason) — so the plan deliberately avoids `@tauri-apps/plugin-shell` and `@tauri-apps/plugin-fs` for this path, keeping arbitrary execution as a small, auditable, host-owned surface instead of fighting the official plugins' scoping model. Always pass `program` + `args: Vec<String>` separately; never build a `sh -c "<concatenated string>"`.
7. Shell/process output is never auto-logged (it may contain secrets/tokens from `git`, API calls, etc.) — only what a plugin explicitly passes to `api.log.*` is written to the status bar or persistent log, and env vars passed to `exec`/`spawn` are never included in log output.
8. **Process lifecycle on app exit**: Windows does not kill child processes when the parent exits, so `AppState`'s tracked children must be explicitly killed (or attached to a Windows Job Object) in a Tauri shutdown hook, not left to the OS.

## Sidebar / content / status-bar architecture

```
App.tsx
 ├─ Sidebar.tsx → SidebarCategory.tsx[] (derived by grouping live plugins by manifest.category, collapse state persisted) → SidebarPluginItem.tsx[] (name + StatusIcon, click sets activePluginId)
 ├─ MainContent.tsx → PluginErrorBoundary → <plugin.Component api={...} />
 └─ StatusBar.tsx (bounded ring-buffer log store in memory, latest entry + severity color, expandable scrollback)
```
Categories are computed live from whatever plugins are discovered (no static config), so a new plugin folder can introduce a brand-new category with zero host changes. `statusIcon.set()` writes into `appStore`, so the sidebar dot re-renders reactively without the plugin touching sidebar internals.

**Logging is also persisted to a rolling file in app-data**, not just the in-memory ring buffer — the dominant failure mode in a tool like this ("it froze/crashed") is exactly the case where in-memory-only logs are lost. Global `window.onerror` and `unhandledrejection` handlers also route to this log with plugin attribution where derivable, since React error boundaries alone don't catch errors in event handlers, timers, or promise rejections.

## Template plugin (`plugins/_template/`)

A copy-from starting point for every new plugin, containing:
- `plugin.json` fully filled out with comments-as-description explaining each field.
- `index.tsx` exporting `activate`, optional `deactivate`, and `Component`, with commented-out example calls to **every** API surface: `statusIcon.set`, `modal.error/info/question/confirm`, `toast.show`, `ui.TextBox` usage, `shell.exec` and `shell.spawn` (including reading streamed stdout), `storage.get/set`, `fs.readTextFile/writeTextFile/watchFile`, `log.info/warn/error`, `theme.palette` + `subscribe` for live theme updates, and a `tick.setInterval`/`tick.requestWake` example showing background work that keeps running while the plugin isn't the active sidebar selection.
- A short `README.md` inside the template folder explaining the manifest fields and lifecycle order (discover → load → activate → mount/unmount → deactivate), so it's usable as onboarding docs, not just code to copy.
- Not itself functional/useful — purely instructional scaffolding; excluded from "real" plugin examples in Milestone 5.

## Build order / milestones

**Re-sequenced after review**: the tick scheduler no longer needs a dedicated spike (it was simplified — see above), and plugin-directory resolution + boot safety are pulled forward into the loader milestone since they constrain it.

1. **Bare scaffold** — `npm create tauri-app` (React-TS template), verify `tauri dev` opens a blank window.
2a. **Transport spike** — before writing any plugin build tooling, prove the core mechanism with a hand-written plain `.js` file: a Rust command reads it as text, frontend wraps it in a Blob and `import()`s the Blob URL, with a minimal `<script type="importmap">` in `index.html` proving a bare specifier from that blob-loaded module resolves against the *document's* import map. Confirm this on both Windows (WebView2) and macOS (WKWebView). This isolates "can the webview import a same-origin blob module and have it resolve bare specifiers via the host's import map" from any bundler/transpiler concerns, so a transport-layer surprise doesn't invalidate build-tooling work done on top of it.
2b. **Plugin loading pipeline** — once 2a is proven, add: the `stewrd-plugin-build` esbuild-wrapper (bundle + watch, `react`/`react-dom`/`react-dom/*`/`react/*` external, including `jsx-runtime`), a real two-file throwaway plugin (to confirm bundling actually inlines relative imports), the generated import-map React-sharing setup (produced by a small Vite plugin, since dependency URLs aren't stable hand-written paths), `notify-debouncer-full` watching `dist/index.js` for hot reload (creating a fresh Blob URL and revoking the old one on each reload), render in a blank content div. Exit criteria: two-file plugin renders correctly, hooks work against host's single React instance, editing plugin source triggers an esbuild rebuild + host hot-reload without an app restart, error boundary + global `window.onerror`/`unhandledrejection` handlers confirmed catching a deliberate throw in activate/render, and boot-safety mark-before-run (marked before the Blob-URL `import()`, not just before `activate()`) auto-disable confirmed by deliberately hanging/crashing a plugin on its first load.
3. **Host shell UI** (Sidebar/MainContent/StatusBar) against mock plugin data, then swapped to the real registry from step 2b.
4. **Core API surface + tick scheduler**, built together in priority order: storage (atomic writes) + persistent log + statusIcon → tick scheduler (including overlap/watchdog/reentrancy handling) → shell.exec/spawn + Rust IPC (batched output events, exit cleanup) → theme/palette propagation → modal + toast → ui.TextBox. Confirm idle CPU stays flat with zero registered ticks and a `setInterval(1000)` plugin produces sparse wakeups, not busy polling, as part of this milestone rather than a separate spike.
5. **Template plugin** built alongside step 4, updated as each API piece lands, so it always demonstrates the current real API (not a stale mock).
6. **Three example/dogfood plugins**, increasing complexity: Notepad → Claude settings editor → Git Tracker (validates tick scheduler under real recurring load + streaming spawn, and the Rust-`tokio::interval` pattern for background work that must survive minimization).
7. **Hardening** — stress error boundaries (throw in activate/tick/render), malformed manifests, hot add/remove while running, child-process cleanup on app exit, and confirm `tauri build` still resolves the per-user app-data plugins directory correctly in a packaged build (not just dev mode).

## Verification

- Milestone 2a exit test: a hand-written plain `.js` module, delivered via Blob URL, successfully `import()`s and resolves a bare specifier through the host's import map, on both Windows and macOS.
- Milestone 2b exit test: a two-file bundled plugin renders, `useState` works against host's single React instance, editing plugin source triggers rebuild + hot-reload without an app restart, and a plugin that hangs/throws on activation gets auto-disabled (mark-before-run) rather than blocking future launches.
- Milestone 4 exit test: OS process monitor shows flat idle CPU with zero registered ticks; a plugin with `setInterval(1000)` shows periodic-but-sparse wakeups only; killing the app mid-spawn leaves no orphaned child process.
- Milestone 6 exit test: all three example plugins function end-to-end (Notepad autosaves via atomic writes + successfully shells out to `claude`; settings editor blocks invalid JSON saves; Git Tracker polls and can spawn a headless `claude` run against a real repo, surviving the window being minimized).
- Milestone 7 exit test: `tauri build` produces a packaged app that still discovers and loads plugins from the correct per-user app-data directory on the target OS.
