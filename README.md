# Stewrd

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/O0G227OHN1)

A personal, cross-platform (Windows/macOS/Linux) desktop app whose functionality is delivered almost entirely by **hot-loadable plugins**. The host app is a shell — a sidebar of installed plugins grouped by category, a main content area split into resizable panes so multiple plugins can be visible at once (dashboard-style, with saveable/recallable named layouts), and a status bar for logs/errors.

## Features

- Hot-loadable plugins — trusted, unsandboxed JS/TS bundles with full shell/filesystem/storage access through a host-provided API
- Split-pane, dashboard-style layout with saved/recallable named layouts
- Theming — switch between premade or custom color palettes, applied live across the host and every plugin
- Self-updating (checks GitHub Releases, downloads and verifies signed updates)

## Tech stack

Tauri 2 (Rust backend) + React 19 + TypeScript + Zustand, plugin bundles built with esbuild.

## Getting started

```sh
npm install
npm run plugin:build -- plugins/_template   # dist/ is gitignored — build each plugin at least once
npm run plugin:build -- plugins/notepad
npm run tauri dev                            # full app in dev mode
npm run tauri build                          # packaged app for the current OS
```

## Creating plugins

Copy `plugins/_template/` to start a new plugin — it demonstrates every host API surface. The easiest way to build a plugin is to point an AI coding assistant (e.g. Claude Code) at this project and describe what you want: it uses `CLAUDE.md`, [ARCHITECTURE.md](ARCHITECTURE.md), and the `_template` plugin to generate a working plugin for you.

For the full plugin API, lifecycle, and host internals, see [ARCHITECTURE.md](ARCHITECTURE.md).

## License

Stewrd is source-available under the [Business Source License 1.1](LICENSE). Personal, non-commercial use is free. Commercial/company use requires a paid license — contact chrisbirth@gmail.com. On 2030-01-01 (or 4 years after each version's release, whichever is first), that version converts to Apache 2.0.

Donations are welcome and appreciated if you find this useful — see the ko-fi button above.
