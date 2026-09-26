# Phase 01 — Rust Core: `install_plugin_from_url`

Status: **FULLY DONE** — logged.rs wrapper + lib.rs registration added, `cargo check` clean, `cargo test --lib plugin_install` 17/17 pass.

## What's done
- `src-tauri/src/commands/plugins.rs`: `SUPPORTED_API_VERSION` is now `pub(crate)`.
- `src-tauri/src/commands/plugin_install.rs`:
  - `InstallMode { Install, Update }` enum (serde lowercase).
  - `install_plugin_from_archive` unchanged behavior, now delegates to shared core.
  - New `#[tauri::command] pub async fn install_plugin_from_url(app, url, file_name, mode, expected_dir)` — rejects non-`https://github.com/` URLs, downloads via `reqwest`, delegates to shared core.
  - Shared core `install_from_bytes(plugins_dir: &Path, bytes, file_name, mode, expected_dir)` — **note: takes `&Path`, not `&AppHandle`** (refactored this way specifically so unit tests don't need a mock `AppHandle`; both command wrappers call `resolve_plugins_dir(&app)?` themselves and pass the `Path` in).
  - `InstallMode::Install`: unchanged original behavior.
  - `InstallMode::Update`: extracts to a throwaway sibling temp dir (`unique_temp_dir`), verifies there first, never `remove_dir_all`s the live folder, copies entry file + `icon.png` + `plugin.json` + merged `settings.json` via `copy_via_tmp_rename` (tmp+rename, ordered), rejects plugin-id mismatch and unsupported apiVersion before any write.
  - `apply_update_copy`, `unique_temp_dir`, `copy_via_tmp_rename`, `merge_and_write_settings` helpers added.
  - 4 new tests covering: verify-failure never deletes live folder, success preserves `storage.json`/`data/` and merges settings correctly, mismatched plugin id rejected, unsupported apiVersion rejected in both modes.
- `src-tauri/Cargo.toml`: no dependency changes needed in the end (the `tauri = { features = ["test"] }` dev-dep that was briefly added was removed again once `install_from_bytes` was switched to `&Path` — no `AppHandle` mocking needed).

## What's left
Nothing for this phase. `install_plugin_from_url_logged` is registered in `logged.rs` and wired into `lib.rs`'s `generate_handler!`. Commit this phase's diff (plugins.rs, plugin_install.rs, logged.rs, lib.rs, Cargo.toml) before starting phase 02/03/04.

## Verification for this phase
- `cargo test --lib plugin_install` — 17/17 pass. Confirmed.
- `cargo check` from `src-tauri/` — clean (only pre-existing dead-code warnings in updates.rs). Confirmed.
