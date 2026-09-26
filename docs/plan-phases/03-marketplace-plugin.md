# Phase 03 — `plugins/marketplace` Scaffold & UI

Status: **Scaffold DONE.** `plugins/marketplace/{plugin.json,settings.json,index.tsx,README.md}` written, builds cleanly (`node scripts/stewrd-plugin-build.mjs plugins/marketplace`), type-checks cleanly (`npx tsc -p plugins/tsconfig.json` after adding `marketplace/**/*` to its `include`). Depends on Phase 01 (done) for the `install_plugin_from_url` command it calls.

## What's implemented
- Catalog fetch from `raw.githubusercontent.com` with `data/catalog-cache.json` fallback via `api.fs` (never `api.storage` - avoids the hot-reload-loop trap).
- Per-repo `releases/latest` fetch, in-memory cache with 15min TTL, only on row-expand/install (not eager per-row).
- Rate-limit (403 + `X-RateLimit-Remaining: 0`) vs. offline distinguished as separate Banner states.
- Install/update via raw `invoke("install_plugin_from_url", ...)`, confirm modal naming repo+tag before every call.
- Update detection matches installed plugins by `manifest.id` via `invoke("list_plugins")`, with a `dir`-based fallback for broken/`Error`-variant entries (repair path).
- Semver comparison (`compareSemver`) treats unparseable versions as "unknown ETA", never "always offer update".
- apiVersion mismatch shown as a UX-nicety Banner (Rust already enforces the real guard, phase 01).

## What's NOT done yet
- No icon.png (optional per plugin.json's `icon` field being "unused - reserved"; skipped, not required).
- No automated tests yet for this plugin's logic - deferred to Phase 05 (depends on the `vitest.config.ts` include-glob decision made there).
- Manual/live verification (real webview CORS check, rate-limit banner, no-hot-reload-loop, full end-to-end install of a real test entry) not yet done - see this phase's Verification section below and Phase 05.
- Not yet committed as of writing this file.

Read master plan Design sections 1-5 in full before starting — this file summarizes structure/checklist only, not the UX/security rationale.

## Before writing any UI
Per `plugins/CLAUDE.md` and root `CLAUDE.md`: check `plugins/_template/demos/` and `plugins/_template/index.tsx` for existing `api.ui` component patterns (TextBox, IconTextButton, Banner, Spinner, modal.confirm) before hand-rolling anything. Use `plugins/_template` as the structural reference (manifest shape, index.tsx structure, settings, README). Read `ARCHITECTURE.md` for the full plugin API surface first.

## Scaffold
- `plugins/marketplace/plugin.json`, `index.tsx`, `settings.json`, `README.md`, `icon.png` — modeled on `plugins/_template`. Normal plugin, `background: false`, lazy-activated.
- Title Case for all titles/button text (root CLAUDE.md MANDATORY rule). Colors only from `Palette` fields — never hardcoded.

## Functional pieces (see master plan Design 1-5 for full detail)
1. **List view** — `fetch(catalogUrl)` from `raw.githubusercontent.com` (CORS-safe). Render with `api.ui` (TextBox search, card list, Spinner, Banner on failure). Cache last-fetched catalog via `api.fs.writeTextFile` under the plugin's own `data/` — **never `api.storage`** (writes to `storage.json`, which the fs watcher does NOT ignore, causing a hot-reload/remount loop if fetched on mount — confirmed trap, see master plan's Caching correction).
2. **Per-entry metadata** — fetched only on row-expand or Install click, never eagerly for every row (60/hour unauthenticated GitHub API rate limit). `fetch(api.github.com/repos/${repo}/releases/latest)`. Cache per-repo with ~15min TTL. Distinguish offline (fetch throws) vs rate-limited (403 + `X-RateLimit-Remaining: 0`, show reset time from `X-RateLimit-Reset`) as two different Banner states.
3. **Install/update trigger** — call `invoke("install_plugin_from_url", { url, fileName, mode, expectedDir })` directly via raw `invoke` from `@tauri-apps/api/core` (no `pluginDiscovery.ts` wrapper needed — same tier as `git-tracker`'s `start_interval`). Show `api.modal.confirm` naming the repo + resolved tag + a plain statement that this runs the author's code with full system access, before every install/update call.
4. **Update detection** — match installed plugins (from `list_plugins`) to catalog entries by `dir` (fallback for broken `Error`-variant entries with no `manifest.id`), not `id` alone. Compare semver (strip leading `v` from `tag_name`); treat unparseable either-side as "unknown", never "always offer update". Offer "Repair" for any installed entry surfaced as `Error`, regardless of version comparison — calls `mode: "update"` with `expected_dir` set to that entry's `dir`.
5. **apiVersion UX nicety** — marketplace's own bundled build can hard-code/compare against `SUPPORTED_API_VERSION`'s value for a friendly pre-flight warning; the real enforcement is already in Rust (Phase 01), this is just UX polish, not a substitute.

## Verification for this phase
- `npm run plugin:build -- plugins/marketplace` builds cleanly.
- Manually confirm in a real webview: `fetch()` against `raw.githubusercontent.com`/`api.github.com` succeeds; `fetch()` against a `releases/download/...` asset URL fails with CORS (confirms why Phase 01's command is needed — don't skip this check even though the command already exists).
- Confirm no hot-reload loop: watch plugin generation/status bar while browsing/expanding rows.
- Confirm the install confirmation modal appears before every install/update and names the repo + tag.
- See Phase 05 for Vitest coverage of this plugin's logic (deferred there because it depends on the `vitest.config.ts` include-glob decision).
