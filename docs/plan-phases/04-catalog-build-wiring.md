# Phase 04 — Catalog File & Build/CI Wiring

Status: **DONE.** `scripts/stage-bundled-plugins.mjs` staged `marketplace` successfully after Phase 03's scaffold; `tauri.conf.json`/`.github/workflows/release.yml` updated; catalog file + trust-model README added.

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

## What's done
- `docs/plugin-catalog.json` — seeded as an empty `[]` array (no example entries yet; real entries are a PR-driven, ongoing process, not part of this scaffolding work).
- `docs/plugin-catalog.README.md` — trust-model note (repo always resolves to author's *current* release; future pinning is out of scope for v1).
- `scripts/stage-bundled-plugins.mjs` — `"marketplace"` added to `BUNDLED_PLUGINS`. Verified locally: `node scripts/stage-bundled-plugins.mjs` stages all three bundled plugins including marketplace cleanly.
- `src-tauri/tauri.conf.json` — added `"../bundled-plugins/marketplace": "plugins/marketplace"` to `bundle.resources`.
- `.github/workflows/release.yml` — added "Build Marketplace plugin bundle" step before "Stage bundled plugins".

## What's left
- Confirm a real tag push (or manual workflow dispatch) actually exercises the new CI step successfully — can't be verified from this session without pushing a release tag; do it on the next real release.
- Cross-check with Phase 02: after a real CI-produced zip exists, unzip it and confirm `plugins/marketplace/` is at the path `seed_bundled_plugins` reads.
