# Phase 02 — Bundled-Plugin Seeding on In-App Update

Status: Not started. Depends on Phase 01 (done).

Read master plan section "Rust changes required" → the `apply_pending_update_if_present` bullet, for full rationale. Summary below.

## Problem
`src-tauri/src/commands/updates.rs`'s `apply_pending_update_if_present` only copies `stewrd.exe`, `assets/` (add-only), `ARCHITECTURE.md`, `plugins/CLAUDE.md`, `plugins/build-plugin.mjs` across an in-app auto-update. It never copies a newly-bundled plugin folder (e.g. `plugins/marketplace/`) into an already-installed deployment — a user who updates in-app (not via the NSIS installer) never receives new bundled plugins.

## Key corrections from plan review (must honor both)
1. The update zip has **no `bundled-plugins/` directory** — that's only a build-time staging name. In the actual build output / update zip, it's `plugins/<id>` (same path `pending_dir.join("plugins/CLAUDE.md")` already reads). Walk `pending_dir/plugins/*`, not `pending_dir/bundled-plugins/*`.
2. A naive "copy if missing at deploy dir" rule would **resurrect a bundled plugin the user deliberately deleted** (`remove_plugin` deletes bundled plugins same as any other; `_template` ships default-disabled). Must track which bundled plugin ids have already been seeded at least once, via a small state-dir marker file — same pattern as the existing `seed_default_disabled_plugins`/`SEEDED_DEFAULTS_FILE` (read `plugins.rs` for that exact pattern before implementing). Only add-only-copy a bundled plugin folder for an id **not yet recorded as seeded**.

## Steps
1. Read `src-tauri/src/commands/updates.rs` in full (627 lines) — specifically `apply_pending_update_if_present`, `copy_add_only`, `overwrite_copy_if_present`.
2. Read `src-tauri/src/commands/plugins.rs`'s `seed_default_disabled_plugins`/`SEEDED_DEFAULTS_FILE` pattern for the marker-file precedent to mirror.
3. Extend `apply_pending_update_if_present`: after its existing copies, walk `pending_dir/plugins/*` subdirectories; for each id not in the seeded-marker file, `copy_add_only`-style copy the whole folder into the live `plugins/` dir, then record it as seeded.
4. Add unit test(s) mirroring existing `updates.rs` test style (mock a pending dir with a `plugins/marketplace/` folder, run seeding logic, assert copied once; assert a second run / an id already marked seeded does not resurrect a user-deleted folder).
5. **Verification must include a real CI-produced zip**, not just unit tests: after Phase 04 wires marketplace into the build, unzip a real `stewrd-v<ver>-windows.zip` and confirm `plugins/marketplace/` is at the path this code reads.

## Verification for this phase
- New unit tests pass.
- `cargo check`/`cargo test --lib` clean.
- Manual: deploy an old build, drop a pending-update zip containing a new bundled plugin folder, run the app, confirm the plugin appears after restart — and confirm deleting it then updating again does not resurrect it.
