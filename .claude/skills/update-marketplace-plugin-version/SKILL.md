---
name: update-marketplace-plugin-version
description: Bump a marketplace plugin's version and cut a matching GitHub release, or add a new plugin repo to the marketplace catalog. Use when Topher asks to "update the marketplace version", "bump plugin version", "release a new version of <plugin>", "publish a plugin update", or "add <repo> to the marketplace".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
shell: powershell
---

# Update Marketplace Plugin Version

Step 0: read `C:\Users\chris\.claude\skills\memory\creating-skills-memory.md` and apply every lesson before proceeding. If a mistake occurs during this skill, append a one-sentence lesson there.

## Key facts

- `C:\git\stewrd\docs\plugin-catalog.json` (fetched live by the in-app Marketplace plugin) has fields `id`, `name`, `description`, `repo`, `apiVersion`, `category` — **no version field, never add one**. `repo` always resolves to that repo's `releases/latest` at install time (see `docs/plugin-catalog.README.md`).
- The actual, informational version lives in each plugin's own `settings.json`, inside that plugin's own separate GitHub repo, cloned locally at `C:\GIT\<repo-name>` (per global CLAUDE.md convention). E.g. `C:\GIT\claude-control\settings.json`, `C:\GIT\stewrd-terminal\settings.json`.
- Marketplace install/update requires the plugin's latest GitHub release to have a `.zip` asset attached (`findZipAsset` in `plugins/marketplace/index.tsx`). A release without one leaves Install/Update disabled for every user. Never publish a release without one.
- Marketplace decides "update available" via semver comparison of the release tag vs the installed version — a same-or-lower version bump never registers as an update.

## Case A — bump an existing plugin's version

1. Resolve the plugin's repo: look it up by `id`/`name` in `C:\git\stewrd\docs\plugin-catalog.json` (`repo` field, e.g. `tellek/claude-control`).
2. Locate `C:\GIT\<repo-name>`; `git clone https://github.com/<repo>.git` there if missing.
3. `git status --porcelain --untracked-files=no` — stop and tell Topher if any *tracked* file is dirty. Untracked files (stray zips, scratch files) are fine and ignored throughout. Otherwise `git pull`.
4. Determine the target version:
   - Read the latest release tag (`gh release list -R <repo>`) and the current `settings.json` `"version"` — use the higher of the two as baseline; tell Topher if they disagreed.
   - If Topher gave an explicit version, use it, but refuse if it's not strictly greater than the baseline.
   - Otherwise default to a patch bump off the baseline (minor if Topher described new functionality). State the assumption.
5. Edit `settings.json`'s `"version"` field to the new value. Don't touch `plugin.json` (no version field there).
6. If the repo has a build step (`dist/` + a `build` script in `package.json`): run `npm install` if `node_modules` is missing, then the build, then `npm test`/`npm run test` if present — stop and report on any failure.
7. Build the release zip in the scratchpad dir (never inside the repo): check the current latest release's asset layout (`gh release view <latest-tag> -R <owner>/<repo> --json assets`) and any existing local `<repo>.zip` to match structure; include `plugin.json`, the bumped `settings.json`, `dist/`, `icon.png`, `README.md` as applicable, excluding `node_modules`/`.git`.
8. **Confirm with Topher before committing anything** — show old → new version, the uncommitted `settings.json` diff, and zip contents. Skip only if he gave an explicit version and said to proceed without asking. This is a public, hard-to-undo push + release that every install auto-offers as an update.
9. Once confirmed: stage only `settings.json` and rebuilt `dist/` files by path — never `git add -A`/`commit -a`. Commit (`Bump version to X.Y.Z`, matching the repo's own `git log` style if discernible).
10. Push to the plugin repo's main branch.
11. `gh release create vX.Y.Z <path-to-zip> -R <owner>/<repo> --generate-notes` (tag prefixed `v` to match existing convention).
12. Verify: `gh release view vX.Y.Z -R <owner>/<repo> --json assets` shows the zip attached.
13. Report to Topher: old → new version, release URL.

## Case B — add a plugin repo to the marketplace

1. Given a GitHub repo, verify it has a `plugin.json` (`gh api repos/<owner>/<repo>/contents/plugin.json` or clone) and pull `id`, `name`, `description`, `apiVersion`. Check `apiVersion == "1"` and `id` isn't already in `docs/plugin-catalog.json` — stop and tell Topher if either fails.
2. Check `gh api repos/<owner>/<repo>/releases/latest` has a `.zip` asset — warn and stop if there's no releasable zip.
3. Clone to `C:\GIT\<repo-name>` if not already present.
4. Append an entry to `C:\git\stewrd\docs\plugin-catalog.json` matching the existing shape (`id`, `name`, `description`, `repo`, `apiVersion`, `category` — ask Topher for `category` if it can't be inferred; it must match a Settings > Categories id in the host). 2-space indent, no version field.
5. Stage only `docs/plugin-catalog.json` by path (never `git add -A`/`commit -a`). Commit directly to `main` (`docs: add <plugin name> to marketplace catalog`) and push — no build/test/ARCHITECTURE.md update needed for a static catalog data entry.

## Implementation notes

- The two repos involved are distinct: the plugin's own repo (version bump + release) lives outside `C:\git\stewrd`, at `C:\GIT\<plugin-repo>`; the catalog file lives inside `C:\git\stewrd\docs\plugin-catalog.json`.
- See `C:\git\stewrd\docs\plugin-catalog.README.md` for the catalog's trust model, and `C:\git\stewrd\plugins\CLAUDE.md` for the `settings.json` `version` field's meaning.
