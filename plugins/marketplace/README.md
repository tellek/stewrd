# Marketplace plugin

Browses the community plugin catalog (`docs/plugin-catalog.json` in this
repo, fetched live from `raw.githubusercontent.com`) and installs/updates
entries with one click, resolving each catalog entry's `repo` field against
that repo's own latest GitHub release.

## How it works

1. Fetches the catalog JSON (cached under this plugin's own `data/` folder,
   via `api.fs`, so a stale copy still shows something if offline - never via
   `api.storage`, which would fire a hot-reload on every write).
2. Per-entry release metadata (`api.github.com/.../releases/latest`) is
   fetched for every visible catalog row as soon as the catalog loads, so the
   table's Version/↓ columns populate without an extra click. It's cached
   in-memory with a 15-minute TTL to stay well under GitHub's 60/hour
   unauthenticated rate limit.
3. Installing/updating downloads happen server-side, via the host's
   `install_plugin_from_url` Rust command (invoked directly via
   `@tauri-apps/api/core`'s `invoke`, the same raw-invoke tier as
   `git-tracker`'s `start_interval`) - a release asset's download URL 302s
   with no CORS header, so this plugin's own `fetch()` can't do it.
4. Every install/update shows a confirmation modal naming the repo and
   resolved release tag first.

## Trust model

A catalog entry always resolves to whatever the author's *current* GitHub
release happens to be - approving a catalog entry is an ongoing trust
relationship with that repo, not a one-time review of pinned bytes. This is
the same trust level already extended to any installed plugin (`api.shell`
is fully trusted, no allowlist) - just made explicit at the moment of
install via the confirmation modal. A future hardening pass could let a
catalog entry optionally pin a `tag` + `sha256`; out of scope for v1.

## Catalog format

See `docs/plugin-catalog.json` at the repo root.

## Building

```sh
node ../../scripts/stewrd-plugin-build.mjs . --watch
```
