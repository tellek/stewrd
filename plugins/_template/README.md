# Template plugin

Copy this whole `_template/` folder to start a new plugin. Rename the folder
and update `plugin.json`'s `id`/`name` and `settings.json`'s `category` to
match.

## `plugin.json` fields

| Field | Meaning |
|---|---|
| `id` | Unique identifier. Should match the folder name. Used for storage/fs namespacing, hot-reload matching, and boot-safety marks. |
| `name` | Display name shown in the sidebar. |
| `version` | Your own semver, informational only. |
| `icon` | Unused - reserved. To give your plugin a sidebar icon, drop `icon.png` into the plugin's own folder instead - it's rendered as a CSS mask, tinted to the current theme color. |
| `entry` | Path to the **built** output the loader actually imports, always `dist/index.js` - you write `index.tsx`, esbuild produces this. |
| `description` | Shown in discovery-error messages and tooling; keep it short. |
| `apiVersion` | Must match the host's supported version (currently `"1"`) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at app startup for off-screen work (e.g. a poller). `false` (default) = activate lazily on first sidebar selection. Only set this if you actually need to run before the user opens the plugin. |

## `settings.json` (optional, but this is where `category` lives)

Drop a `settings.json` next to `plugin.json` - it's a **plain JSON object**,
not a schema. The host only ever reads one key out of it, `"category"`
(sidebar grouping - must match a category id from Settings > Categories, or
the plugin lands under "Other"); everything else in the object is entirely up
to you as the plugin author. There's no built-in type system, form generation,
or validation beyond "is it valid JSON."

```json
{
  "category": "Templates",
  "greeting": "Hello!",
  "refreshSeconds": 30
}
```

Users edit this file directly from **Settings > Plugins > Configure** - a raw
JSON text editor (JSON-validated before it's ever written to disk), not a
generated form. Saving there writes straight back to this file, and since it
lives inside the already-watched `plugins/` tree, the host picks up the change
(including a `category` edit re-grouping the sidebar) without a restart.

Omit the file entirely if your plugin has nothing to configure and doesn't
need to set `category` - Configure will still work, offering a starter
`{ "category": "" }` object to fill in.

**No built-in way for a plugin to read its own custom keys back at runtime
today** - `ctx.api.fs` is sandboxed to the plugin's app-data folder, not its
own install folder where `settings.json` actually lives. A plugin wanting to
consume its own custom values (anything besides `category`, which is purely a
host-side concern) would need the same `ctx.api.shell.exec`-based workaround
`plugins/claude-settings-editor/index.tsx` uses to reach a file outside its
sandbox. This is a known limitation, not something this convention solves.

For backward compatibility, a `plugin.json` with an old-style `category` field
and no `settings.json` still works (the manifest value is used as a fallback)
- but `settings.json` is the recommended place for new plugins, and wins if
both are present.

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
