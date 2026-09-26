# Phase 05 — Docs, Test Wiring, End-to-End Verification

Status: **DONE** (the parts verifiable from this session — see "What's left" for the parts that require a real release/tag push and can't be exercised here).

## What's done
- ARCHITECTURE.md §6/§9/§11 updated: `install_plugin_from_url` documented as a raw-invoke escape hatch (with its shared `install_from_bytes` core, temp-dir/never-remove-live-folder update behavior, and apiVersion guard), a Rust command-surface table row added, and `marketplace` added to the example-plugins table.
- `vitest.config.ts`'s `include` widened to `["src/**/*.test.{ts,tsx}", "plugins/**/*.test.{ts,tsx}"]` — confirmed the new test file is actually collected (`npx vitest run` shows it, not silently skipped).
- `plugins/marketplace/index.test.ts` added: 12 tests covering `parseSemver`/`compareSemver` (including the "never claims an update when either side fails to parse" invariant), `findZipAsset`, and `loadCatalog`'s fetch/cache/stale-fallback/no-cache-throw paths (mocked `fetch`/`api.fs`). `parseSemver`, `compareSemver`, `findZipAsset`, `loadCatalog` were exported from `index.tsx` (no behavior change) to make this possible without network I/O.
- Full suite green: `npx vitest run` → 464/464 tests pass (81 files). `npx tsc -p plugins/tsconfig.json` clean. `cargo test --lib` → 76/76 pass, `cargo check` clean (pre-existing dead-code warnings only, unrelated to this work).
- `npm run plugin:build -- plugins/marketplace` builds cleanly.
- README.md updated: added a "Marketplace plugin" bullet under Features and a `plugin:build -- plugins/marketplace` line under Getting Started, since this is a discoverable, human-facing feature (not just internal architecture).

## What's left (needs a real release/tag push or a live install to exercise — can't be done from this session)
- Rate-limit path: mock/trigger a real 403 + `X-RateLimit-Remaining: 0` in a live browser session and confirm the distinct rate-limit Banner shows.
- Install confirmation modal / no-hot-reload-loop: needs a running deployed app, manual browsing.
- Full `build-release.bat` + real install/update end-to-end against a real small test plugin repo.
- Confirm a real tag push exercises `.github/workflows/release.yml`'s new Marketplace build step (Phase 04's own deferred item).
- Confirm an in-app auto-update on an existing install actually delivers the bundled Marketplace plugin (Phase 02's own deferred item) — requires a real published release to update *from*.

These are all explicitly deferred to the next real release cycle, not silently dropped — see Phase 02/04's own "what's left" notes for the same items from their side.

## ARCHITECTURE.md updates
- §6 — document the raw-invoke `install_plugin_from_url` command (mirror how `git-tracker`'s `start_interval`/`stop_interval` raw-invoke usage is already documented there). Note: §6 currently has a stale reference to the removed `git-tracker` plugin — don't perpetuate that if editing nearby text, but don't scope-creep into unrelated cleanup either.
- §9 — add a row for `install_plugin_from_url` in the Rust backend command surface table.
- §11 — add `marketplace` to the example-plugins table.
- Per root CLAUDE.md's general rule: update ARCHITECTURE.md for every phase that changes architecture/API surface, not just this one — this phase is a final sweep to catch anything missed, not the only place it happens.

## vitest.config.ts
- Current `include` is `["src/**/*.test.{ts,tsx}"]` — does not collect anything under `plugins/marketplace/`. Decide: widen `include` to also cover `plugins/**/*.test.{ts,tsx}` (no existing plugin has tests today — new ground), or keep `plugins/marketplace/index.tsx` thin and put logic-level tests under `src/`. Confirm the decision actually collects tests before writing them (run `npx vitest run` and check the test shows as executed, not just added).

## Test coverage to add (mirroring `SettingsPlugins.test.tsx`'s mock style)
- Catalog fetch/parse.
- apiVersion compatibility check (UX-nicety comparison in the marketplace plugin, not the Rust enforcement — that's already covered by Phase 01's Rust tests).
- Install-trigger path (mock `invoke`/`fetch`).

## End-to-end / manual verification (from master plan's Verification section — do all of these)
- `npm run plugin:build -- plugins/marketplace` builds cleanly (re-check after any late changes).
- Rate-limit path: mock/trigger a 403 + `X-RateLimit-Remaining: 0` and confirm the distinct rate-limit Banner (with reset time) shows, separate from the offline Banner.
- Install confirmation modal appears before every install, names repo/tag.
- No hot-reload loop while browsing/expanding catalog rows.
- Full `build-release.bat`, launch deployed exe, open Marketplace plugin, confirm catalog loads, install a real small test entry end-to-end, confirm it appears in Settings > Plugins and works.
- Publish a new release tag on that same test entry's repo, confirm `mode: "update"` preserves `storage.json`/`data/`/custom `settings.json` keys, refreshes just `version`, and no longer shows "update available" right after.
- Confirm a tag push passes `.github/workflows/release.yml` including the new Marketplace build step (cross-check with Phase 04).
- Confirm (per Phase 02) that an in-app auto-update on an existing install actually delivers the new bundled Marketplace plugin.

## When this phase is done
The whole plan is complete. Do a final commit + push to main, and confirm `./build-release.bat` succeeds per root CLAUDE.md's General rules.
