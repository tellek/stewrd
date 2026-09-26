# Plugin Marketplace — Phase Overview

Master plan (full spec, read this for any design detail not repeated here):
`C:\Users\chris\.claude\plans\replicated-waddling-meerkat.md`

Work is split into phases so each can be executed in its own session. Load
this file plus the one phase file you're working on — not the whole master
plan — to keep context small. Update the Status line in each phase file as
you go.

## Phases
- [01-rust-core.md](01-rust-core.md) — `install_plugin_from_url` command, logged.rs/lib.rs registration. **DONE.**
- [02-update-seeding.md](02-update-seeding.md) — `apply_pending_update_if_present` bundled-plugin gap fix. Not started.
- [03-marketplace-plugin.md](03-marketplace-plugin.md) — `plugins/marketplace` scaffold + UI. Not started.
- [04-catalog-build-wiring.md](04-catalog-build-wiring.md) — catalog JSON, staging script, tauri.conf.json, CI workflow. Not started.
- [05-docs-tests-verification.md](05-docs-tests-verification.md) — ARCHITECTURE.md updates, vitest config, end-to-end verification. Not started.

## Order
01 → (03 and 04 can happen in either order, both depend on 01) → 02 → 05 last (needs everything else in place to verify end-to-end).

## Ground rules carried into every phase
- Never manually specify a color; use `Palette` fields.
- Title Case for all titles/button text.
- Any new plugin-facing surface needs a `plugins/_template` demo — **not required here**: `install_plugin_from_url` is invoked via raw `invoke()`, same tier as `git-tracker`'s `start_interval` (see master plan, Design step 3).
- After finishing a phase: run tests, update ARCHITECTURE.md if that phase touches documented surfaces, commit + push to main, run `./build-release.bat` for code changes (per project CLAUDE.md).
