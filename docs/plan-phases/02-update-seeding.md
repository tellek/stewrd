# Phase 02 — Bundled-Plugin Seeding on In-App Update

Status: **DONE** — implemented, 2 new unit tests pass, full `cargo test --lib` (76 tests) passes.

Read master plan section "Rust changes required" → the `apply_pending_update_if_present` bullet, for full rationale. Summary below.

## Problem
`src-tauri/src/commands/updates.rs`'s `apply_pending_update_if_present` only copies `stewrd.exe`, `assets/` (add-only), `ARCHITECTURE.md`, `plugins/CLAUDE.md`, `plugins/build-plugin.mjs` across an in-app auto-update. It never copies a newly-bundled plugin folder (e.g. `plugins/marketplace/`) into an already-installed deployment — a user who updates in-app (not via the NSIS installer) never receives new bundled plugins.

## Key corrections from plan review (must honor both)
1. The update zip has **no `bundled-plugins/` directory** — that's only a build-time staging name. In the actual build output / update zip, it's `plugins/<id>` (same path `pending_dir.join("plugins/CLAUDE.md")` already reads). Walk `pending_dir/plugins/*`, not `pending_dir/bundled-plugins/*`.
2. A naive "copy if missing at deploy dir" rule would **resurrect a bundled plugin the user deliberately deleted** (`remove_plugin` deletes bundled plugins same as any other; `_template` ships default-disabled). Must track which bundled plugin ids have already been seeded at least once, via a small state-dir marker file — same pattern as the existing `seed_default_disabled_plugins`/`SEEDED_DEFAULTS_FILE` (read `plugins.rs` for that exact pattern before implementing). Only add-only-copy a bundled plugin folder for an id **not yet recorded as seeded**.

## What's done
- `src-tauri/src/commands/plugins.rs`: `read_id_set`/`write_id_set` made `pub(crate)` (reused, not duplicated).
- `src-tauri/src/commands/updates.rs`: added `SEEDED_BUNDLED_PLUGINS_FILE` const and `seed_bundled_plugins(pending_dir, deploy_dir)` — walks `pending_dir/plugins/*` (the real update-zip path, not `bundled-plugins/`), add-only copies any subdir whose id isn't yet in the marker file (stored at `deploy_dir/seeded-bundled-plugins.json`), marks it seeded either way so a user-deleted bundled plugin is never resurrected. Called from `apply_pending_update_if_present` right before it clears `pending_dir`. Best-effort throughout — never fails the update apply that already succeeded.
- 2 new unit tests: seeds a new bundled plugin folder once; never resurrects one the user deleted after it was already seeded. `cargo test --lib` — 76/76 pass, `cargo check` clean.

## What's left
- **Verification requiring a real CI-produced zip** (can't be done until Phase 04 wires `marketplace` into the build): unzip a real `stewrd-v<ver>-windows.zip`, confirm `plugins/marketplace/` is at the path `seed_bundled_plugins` reads, and do a manual in-app-update dry run.
- Commit this phase's diff (plugins.rs, updates.rs) — not yet committed as of writing this file.
