# Template plugin

Copy this whole `_template/` folder to start a new plugin. Rename the folder
and update `plugin.json`'s `id`/`name` and `settings.json`'s `category`/`version`
to match.

## `plugin.json` fields

| Field | Meaning |
|---|---|
| `id` | Unique identifier. Should match the folder name. Used for storage/fs namespacing, hot-reload matching, and boot-safety marks. |
| `name` | Display name shown in the sidebar. |
| `version` | **Legacy fallback only** - see `settings.json` below, which is now the primary source. Kept optional on this struct for plugins that predate `settings.json`. |
| `icon` | Unused - reserved. To give your plugin a sidebar icon, drop `icon.png` into the plugin's own folder instead - it's rendered as a CSS mask, tinted to the current theme color. |
| `entry` | Path to the **built** output the loader actually imports, always `dist/index.js` - you write `index.tsx`, esbuild produces this. |
| `description` | Shown in discovery-error messages and tooling; keep it short. |
| `apiVersion` | Must match the host's supported version (currently `"1"`) or discovery rejects the plugin with a clear error. |
| `background` | `true` = activate eagerly at app startup for off-screen work (e.g. a poller). `false` (default) = activate lazily on first sidebar selection. Only set this if you actually need to run before the user opens the plugin. |

## `settings.json` (optional, but this is where `category`/`version` live)

Drop a `settings.json` next to `plugin.json` - it's a **plain JSON object**,
not a schema. The host only ever reads two keys out of it: `"category"`
(sidebar grouping - must match a category id from Settings > Categories, or
the plugin lands under "Other") and `"version"` (informational, shown in
Settings > Plugins); everything else in the object is entirely up to you as
the plugin author. There's no built-in type system, form generation, or
validation beyond "is it valid JSON."

```json
{
  "category": "Templates",
  "version": "0.1.0",
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
need to set `category`/`version` - Configure will still work, offering a
starter `{ "category": "" }` object to fill in.

**No built-in way for a plugin to read its own custom keys back at runtime
today** - `ctx.api.fs` is sandboxed to the plugin's app-data folder, not its
own install folder where `settings.json` actually lives. A plugin wanting to
consume its own custom values (anything besides `category`/`version`, which
are purely host-side concerns) would need the same `ctx.api.shell.exec`-based
workaround `plugins/claude-settings-editor/index.tsx` uses to reach a file
outside its sandbox. This is a known limitation, not something this
convention solves.

For backward compatibility, a `plugin.json` with old-style `category`/`version`
fields and no `settings.json` still works (the manifest values are used as a
fallback) - but `settings.json` is the recommended place for new plugins, and
wins field-by-field if both are present.

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

## Component Library Coverage

`api.ui.*` is the full set of host-provided, palette-driven components plugins
should use instead of rolling their own `<button>`/`<input>`/etc. Every entry
here has a live usage in `demos/` — copy from there. Adding a new `api.ui`
component requires adding its demo here too (see root `CLAUDE.md`'s
"Component Library" rule).

| Component | Description | Demo |
| --- | --- | --- |
| `TextBox` | Controlled multi-line textarea | `index.tsx` (commented) |
| `StatusDot` | Small status-color indicator dot | `index.tsx` |
| `MaskIcon` | Palette-tinted icon from a PNG data URL | `demos/ButtonsDemo.tsx` |
| `TextButton` | Text-only button, `primary`/`secondary` variants | `demos/ButtonsDemo.tsx` |
| `IconButton` | Icon-only button | `demos/ButtonsDemo.tsx` |
| `IconTextButton` | Icon + label button | `demos/ButtonsDemo.tsx` |
| `Checkbox` | Single checkbox with label | `demos/FormControlsDemo.tsx` |
| `RadioGroup` | Mutually-exclusive option list | `demos/FormControlsDemo.tsx` |
| `Toggle` | On/off switch | `demos/FormControlsDemo.tsx` |
| `Spinner` | Indeterminate loading spinner | `demos/LoadingDemo.tsx` |
| `ProgressBar` | Determinate/indeterminate progress bar | `demos/LoadingDemo.tsx` |
| `Skeleton` | Loading placeholder block | `demos/LoadingDemo.tsx` |
| `Dropdown` | Single-select dropdown | `demos/DropdownsDemo.tsx` |
| `DropdownCheckboxes` | Multi-select dropdown | `demos/DropdownsDemo.tsx` |
| `DropdownRadio` | Single-select dropdown, radio-style items | `demos/DropdownsDemo.tsx` |
| `DropdownImageText` | Single-select dropdown with item images | `demos/DropdownsDemo.tsx` |
| `DropdownImageGrid` | Single-select image grid popover | `demos/DropdownsDemo.tsx` |
| `Tabs` | Tabbed section switcher | `demos/NavigationDemo.tsx` (also used by `index.tsx` for this README's own demo sections) |
| `Pagination` | Prev/next page control | `demos/NavigationDemo.tsx` |
| `Menu` | Click-to-open action list | `demos/NavigationDemo.tsx` |
| `Link` | Styled clickable label | `demos/NavigationDemo.tsx` |
| `Blanket` | Dimming overlay scoped to the plugin's own container (used internally by `Drawer`/`InlineDialog`) | `demos/OverlaysDemo.tsx` (via `Drawer`/`InlineDialog`) |
| `Drawer` | Slide-in panel scoped to the plugin's own container | `demos/OverlaysDemo.tsx` |
| `InlineDialog` | Centered confirm/info card scoped to the plugin's own container | `demos/OverlaysDemo.tsx` |
| `Banner` | Palette-toned inline message, `variant` `"outline"` (default) or `"solid"`, optional left icon, optional dismiss, optional auto-dismiss-with-fade (`autoDismissMs`) | `demos/MessagingDemo.tsx` |
| `RangeSlider` | Native range input, accent-colored track/thumb | `demos/FormControlsDemo.tsx` |
| `Calendar` | Month-grid date picker, ISO `"YYYY-MM-DD"` value | `demos/CalendarDemo.tsx` |
| `DatePicker` | Text field + `Calendar` popover | `demos/CalendarDemo.tsx` |
| `TimePicker` | Native time input, `"HH:MM"` (24h) value | `demos/CalendarDemo.tsx` |
| `DateTimePicker` | `DatePicker` + `TimePicker` combined, `{ date, time }` value | `demos/CalendarDemo.tsx` |
| `CodeTextArea` | CodeMirror 6-backed code editor, fixed `width`/`height` with word-wrap, syntax colors + theme both palette-driven live via `Compartment`s; `language="json"` wired today | `demos/TextAreaDemo.tsx` |

Icon/image props (`IconButton.icon`, `IconTextButton.icon`, and future
`Banner`/`DropdownImageText`/`DropdownImageGrid` image props) take a `data:`
URL string. Two ways to get one, depending on where the image lives:
- **Bundled with your plugin** (an icon you ship): `import icon from "./assets/foo.png"` -
  esbuild's `dataurl` loader inlines it as a base64 string at build time (see
  `demos/ButtonsDemo.tsx`).
- **User/runtime-supplied file**: `await api.fs.readDataUrl(path)`, which reads
  from this plugin's own namespaced storage folder and returns a data URL.

A raw file path or an import without the dataurl loader will not work -
plugin bundles load from a Blob URL at runtime, so relative paths never
resolve.

## `ctx.api.sidebar` - sidebar sub-items

A plugin can register sub-items that render indented under its own sidebar
row via `api.sidebar.setItems([{ id, label, icon?, color?, onClick }, ...])` -
see `index.tsx`'s `Component` for a live example (two pages, "Overview" and
"Second Page", switched via local `useState` in each item's `onClick`). The
plugin owns the full list: it decides its contents, when it's shown (a
non-empty list) vs. hidden (`setItems([])`), and what happens on click. Call
`api.sidebar.setSelected(id)` to change the highlighted sub-item
programmatically - the host already highlights the clicked item itself, so
this is only needed for other navigation paths (e.g. deep-linking).

Each item renders with a small status dot in front of its label - `color` is
a `StatusColor` (same set as `api.statusIcon`) fully controlled by the
plugin, and defaults to a plain muted dot (`palette.textMuted`) if omitted.

Clicking the plugin's own sidebar row toggles its sub-items collapsed/expanded
- but only while that plugin is already the active selection. Clicking the
row of a plugin that *isn't* currently active just selects it (as before)
without touching its collapse state.

Caveat: non-`background` plugins only activate on first sidebar selection, so
a lazy plugin's sub-items don't exist until the user has clicked its row once
- there's no way to show sub-items before that first activation.

## Type checking while authoring

`../.stewrd/plugin-api.d.ts` is an ambient module (`stewrd-plugin-api`) your
editor can resolve for autocomplete/type-checking - it is **not** imported at
runtime (plugins get no module resolution back to the host). The triple-slash
reference at the top of `index.tsx` wires this up; keep it if you copy this
file elsewhere in the same `plugins/` tree.
