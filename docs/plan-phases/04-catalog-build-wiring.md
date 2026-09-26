# Phase 04 — Catalog File & Build/CI Wiring

Status: Not started. Depends on Phase 03 existing (or being written in parallel) for `plugins/marketplace` to actually have something to build/stage.

## Catalog file
- `docs/plugin-catalog.json` — new file, seeded with zero or a couple of example entries. Shape (see master plan "Catalog format & hosting" for full rationale):
  ```json
  [{ "id": "...", "name": "...", "description": "...", "repo": "owner/repo", "apiVersion": "1", "category": "..." }]
  ```
- Hosted URL the marketplace plugin fetches: `https://raw.githubusercontent.com/tellek/stewrd/main/docs/plugin-catalog.json`.
- Add a one-line comment/README note next to it about the v1 trust model (catalog entry = ongoing trust in whatever the author's *current* `releases/latest` is, same trust level as `api.shell` today) and that pinning a `tag`+`sha256` is a possible future hardening, out of scope for v1.

## Build/staging wiring
- `scripts/stage-bundled-plugins.mjs` — add `"marketplace"` to `BUNDLED_PLUGINS` (currently `["notepad", "_template"]`).
- `src-tauri/tauri.conf.json` — add a `bundle.resources` entry `"../bundled-plugins/marketplace": "plugins/marketplace"`, mirroring the existing `notepad`/`_template` entries exactly.
- `.github/workflows/release.yml` — add a "Build Marketplace plugin bundle" step (mirror the existing "Build Notepad plugin bundle"/"Build Template plugin bundle" steps), placed **before** the "Stage bundled plugins" step. Without this, CI's stage script hard-exits on the next tag push once `marketplace` is added to `BUNDLED_PLUGINS`, because it expects `dist/index.js` to already exist — a local `build-release.bat` run (which loops over every plugin folder) would mask this, so don't rely on a local build to validate this step; check the actual workflow YAML step order.

## Verification for this phase
- `node scripts/stage-bundled-plugins.mjs` runs cleanly locally after `plugins/marketplace` has a built `dist/index.js`.
- Confirm a tag push (or a dry run / manual workflow trigger) exercises the new "Build Marketplace plugin bundle" CI step successfully, in the correct order relative to "Stage bundled plugins".
- Cross-check with Phase 02: after a real CI zip is produced, unzip it and confirm `plugins/marketplace/` exists at the path `apply_pending_update_if_present` reads.
