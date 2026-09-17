# Template plugin

Copy this whole `_template/` folder to start a new plugin. Rename the folder
and update `plugin.json`'s `id`/`name`/`category` to match.

## `plugin.json` fields

| Field | Meaning |
|---|---|
| `id` | Unique identifier. Should match the folder name. Used for storage/fs namespacing, hot-reload matching, and boot-safety marks. |
| `name` | Display name shown in the sidebar. |
| `version` | Your own semver, informational only. |
| `category` | Sidebar grouping - a new category name here creates a new collapsible group with zero host changes. |
| `icon` | Reserved for a future icon picker; `"default"` for now. |
| `entry` | Path to the **built** output the loader actually imports, always `dist/index.js` - you write `index.tsx`, esbuild produces this. |
| `description` | Shown in discovery-error messages and tooling; keep it short. |
| `apiVersion` | Must match the host's supported version (currently `"1"`) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at app startup for off-screen work (e.g. a poller). `false` (default) = activate lazily on first sidebar selection. Only set this if you actually need to run before the user opens the plugin. |

## Building

```sh
node ../../scripts/stewrd-plugin-build.mjs . --watch
```

Run this from the plugin's own folder (or point the first argument at the
folder). It bundles `index.tsx` and everything it imports into a single
`dist/index.js`, leaving `react`/`react-dom` (and their subpaths, including
the jsx-runtime) as external bare specifiers so your plugin shares the host's
one React instance instead of bundling a second copy.

## Lifecycle order

1. **Discover** - host scans for `plugin.json` + built `dist/index.js` at startup and whenever a `dist/index.js` changes.
2. **Load** - `background: true` plugins are Blob-URL-imported immediately; everything else waits until first selected in the sidebar.
3. **Activate** - `activate(ctx)` runs once per load. Register tick handlers here, kick off any startup work.
4. **Mount / Unmount** - pure React, toggled by sidebar selection. Does **not** re-run activate/deactivate - your component can mount and unmount many times across one activation.
5. **Deactivate** - runs on hot-reload-replace or app shutdown. Your `deactivate()` export runs first (its return value isn't awaited), then the host runs anything you registered via `ctx.onDispose(fn)`, then aborts `ctx.signal`, then unregisters your tick handler - so an `onDispose` callback can't assume `ctx.signal` is already aborted.
6. **Uninstall** - delete the folder; the next discovery pass removes it and deactivates it if it was active.

## Type checking while authoring

`../.stewrd/plugin-api.d.ts` is an ambient module (`stewrd-plugin-api`) your
editor can resolve for autocomplete/type-checking - it is **not** imported at
runtime (plugins get no module resolution back to the host). The triple-slash
reference at the top of `index.tsx` wires this up; keep it if you copy this
file elsewhere in the same `plugins/` tree.
