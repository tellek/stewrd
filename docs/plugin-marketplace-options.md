# Plugin Marketplace Options

Research notes and a recommendation for letting Stewrd users discover and install plugins from inside the app.

## Where Stewrd Is Today

- Plugins are folders under `plugins/<id>/` with a `plugin.json` (`id`, `name`, `icon`, `entry`, `description`, `apiVersion`, `background`) plus a bundled `dist/index.js`.
- `src-tauri/src/commands/plugin_install.rs` already implements `install_plugin_from_archive(bytes, file_name)` — it unpacks zip/tar/tar.gz in Rust (no shelling out), strips the archive root prefix, finds `plugin.json`, sanitizes paths, and writes into the plugins dir.
- Discovery/loading lives in `src/host/loader/` (`pluginDiscovery.ts`, `pluginLoader.ts`, `usePluginRegistry.ts`); version/category already resolve from each plugin's `settings.json`.
- There is no HTTP client in the Rust side (no `reqwest` in `Cargo.toml`) and no network fetching anywhere in the plugin path.

**Key consequence:** the hard part (safe archive extraction into the plugins dir) is done. A marketplace is mostly "fetch a JSON index, show a list, download bytes, hand them to the existing install command."

## Option 1: Static JSON Index In A GitHub Repo (Obsidian Model)

A `stewrd-plugins` repo holds one file, `community-plugins.json`, listing `{ id, name, author, description, repo }`. The app fetches it over raw.githubusercontent/GitHub Pages. To install, the app resolves the plugin's own GitHub release (tag matching the version in its `plugin.json`) and downloads the asset. Authors submit a PR to add themselves; they host their own releases.

This is exactly how Obsidian bootstrapped: the central repo is an index only, plugin binaries live in each author's GitHub releases, and the app matches the release tag to the manifest version.

**Pros**
- Zero hosting cost and zero backend to operate or secure.
- PR-based submission gives you a natural review gate and a git audit trail; GitHub Actions can lint manifests for free.
- Authors keep ownership of their releases; you never store third-party binaries.
- Failure mode is "GitHub is down," not "my server is down."

**Cons**
- Unauthenticated GitHub requests are rate limited (60/hr per IP for the REST API, and raw.githubusercontent now throttles too). Mitigate with conditional requests/ETags, caching the index to disk for a few hours, and using direct release-asset URLs rather than API calls where possible.
- No search ranking, no download counts, no server-side filtering — you ship the whole index and filter client-side. Fine up to a few thousand entries.
- Requires every plugin author to have a GitHub repo with releases.

**Effort:** small. Roughly: a repo + JSON schema + CI validation (half a day), Rust `fetch_url`/`download_bytes` commands or frontend `fetch` (a few hours), a marketplace pane reusing the existing install path (1-2 days).

## Option 2: Static Index With Centrally Hosted Artifacts

Same JSON index, but you also host the plugin zips — either committed as release assets on your own registry repo, or on Cloudflare R2/Pages behind a stable URL. A CI job pulls approved plugin builds and republishes them.

**Pros**
- One origin to fetch from; simpler rate-limit and caching story.
- You can pin/verify exact bytes and add a hash to the index, so tampering upstream is detectable.
- Works for authors who do not want to run GitHub releases.

**Cons**
- You are now redistributing other people's code — licensing and takedown responsibility.
- Needs a publish pipeline; storage cost is trivial (R2 egress is free) but the pipeline is real work.

**Effort:** medium — add ~1-2 days over Option 1 for the republish automation.

## Option 3: Registry Service (Worker + R2/KV, Or Self-Hosted API)

A real API: search endpoints, pagination, download counts, author accounts, token-authenticated publishing.

**Pros**
- Proper search, telemetry, featured/curated lists, yank/unpublish without a PR.
- Publishing UX ("stewrd publish") instead of a PR to a JSON file.

**Cons**
- Ongoing ops, auth, abuse handling, and a bill (Workers Paid is $5/mo before usage). Note the cost shape: a pre-generated static JSON blob served from static assets is effectively free at any read volume, while a Worker that lists R2 objects per request accrues Class A operation costs — so even here you want a generated index, not live listing.
- Massively premature for a single-developer app with 4 plugins.

**When it is warranted:** hundreds of plugins, multiple maintainers, or a need for download analytics/monetization. Not now.

## Option 4: Direct URL / Git Install Only (No Index)

"Install from URL" box plus the existing "install from file." No registry at all.

**Pros:** near-zero work; the Rust install command already accepts bytes. Good escape hatch for beta plugins.
**Cons:** no discovery, which is the actual ask.

**Verdict:** ship this *alongside* the index, not instead of it — it is also how you support beta testing before a plugin is listed.

## Security And Trust At Indie Scale

Be honest about the model rather than implying safety you cannot deliver. Obsidian's own docs state plainly that they cannot reliably restrict plugins to specific permissions — plugins can read files, hit the network, and launch programs — and that remains the most-criticized part of their model. Stewrd plugins run in the webview with access to the `api.*` surface and the host's Tauri commands, so the same applies here.

Practical, cheap measures, roughly in order of value per hour spent:

1. **Install-time consent.** A clear dialog on first install: "Plugins run with the same access as Stewrd itself. Only install plugins you trust." Non-negotiable, costs an afternoon.
2. **Integrity pinning.** Put a SHA-256 of each published archive in the index and verify it in Rust before extraction. Catches a swapped release asset and is ~30 lines.
3. **PR review + CI checks on the index.** Validate manifest schema, require a repo/license/description, check the `id` is unique and not squatting. GitHub Actions, free.
4. **Manifest disclosures.** Have `plugin.json` declare what it uses (network, filesystem, shell, background) and show those badges before install. Even unenforced, this is the transparency users ask for — and it is the direction Obsidian is heading with disclosures and scorecards.
5. **Enforce the disclosures later** by gating the `api.*` surface in `createPluginApi.ts` per-plugin. This is where Stewrd can genuinely beat Obsidian, because the plugin API is already a single chokepoint you control. Do not block v1 on it.
6. **Safe mode / disable.** Already present (`is_safe_mode`, disabled flag) — surface it in the marketplace UI as "disable" and "uninstall."
7. **Code signing plugins:** skip. Key management and revocation cost more than they buy at this scale; hash pinning plus a reviewed index covers the realistic threats.

## How The Precedents Bootstrapped

- **Obsidian:** central repo holding `community-plugins.json` as an index; plugins downloaded from each author's GitHub release matching the manifest version; manual review of first submissions by a small team, later replaced with automated per-version checks (policy, vulnerabilities, malware scan) plus scorecards, because manual review did not scale.
- **VS Code:** started with a simple publish CLI against a hosted gallery; the enduring lesson is that the *publishing tool* mattered more than the backend — authors need a one-command path from source to listed.
- **Tauri itself:** no central marketplace at all; plugins are just crates/npm packages by naming convention, with security handled app-side via capabilities/permissions/scopes.

The common thread: start with an index, defer the service, invest early in making publishing a single boring step.

## Recommendation For V1

**Option 1 (static JSON index in a GitHub repo), plus Option 4 as an escape hatch.**

Concretely:

1. Create `stewrd-plugins` with `community-plugins.json`: `[{ id, name, author, description, repo, minApiVersion }]`. Add a GitHub Action validating the schema on PR.
2. Add Rust commands for HTTP fetch + download (add `reqwest` with rustls; keep it in Rust rather than webview `fetch` so you avoid widening the CSP and can verify hashes before anything touches disk).
3. Cache the index on disk with an ETag; refresh at most hourly. This alone keeps you clear of GitHub's anonymous rate limits.
4. Marketplace pane: list, search client-side, show disclosures/version/author, Install button → download release asset → verify SHA-256 → call the existing `install_plugin_from_archive`.
5. Update check: compare the installed `version` (already resolved in `pluginDiscovery.ts`) against the index's latest; offer "Update."
6. Keep "Install from File" and add "Install from URL" for unlisted/beta plugins.
7. Ship the consent dialog and a short `PUBLISHING.md` describing the release-tag/manifest-version convention.

Migration path if it outgrows this: the index URL stays the same contract, so swapping the static file for a Worker-generated one later requires no client change. Do not build the service until the index is genuinely painful.

## Sources

- [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
- [Obsidian: Plugin security](https://obsidian.md/help/plugin-security)
- [Obsidian: The future of plugins](https://obsidian.md/blog/future-of-plugins/)
- [Obsidian's plugin security model faces community criticism](https://biggo.com/news/202509200713_Obsidian_Plugin_Security_Concerns)
- [GitHub: Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Changelog: Updated rate limits for unauthenticated requests](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)
- [Tauri: Security and capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri: Plugin development](https://v2.tauri.app/develop/plugins/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
