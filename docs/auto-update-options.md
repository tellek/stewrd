# Auto-Update Options For Stewrd

Research notes and a recommendation for adding app-level auto-update to Stewrd (Tauri v2, Windows-only today, deployed via `build-release.bat` to `C:\Utilities\stewrd`).

Current state that matters:

- `src-tauri/tauri.conf.json` has `bundle.targets: "all"` and no `plugins.updater` block, no `createUpdaterArtifacts`.
- Version is pinned at `0.1.0` and never bumped; the updater compares versions, so a bump step is mandatory.
- `origin` is `github.com/tellek/stewrd`. The repo is currently **private**, but Topher plans to make it **public** eventually — once that happens, the GitHub Releases path (Option 1) has no auth blocker and becomes the simplest option, not a fallback.
- There is no CI; `build-release.bat` does a local build + robocopy deploy.

## How The Tauri v2 Updater Actually Works

`tauri-plugin-updater` is the first-party answer and is the only option that gets in-app "update available → download → relaunch" for free.

Mechanics:

1. You generate a keypair with `npx tauri signer generate`. Public key goes in `tauri.conf.json`; private key is passed to the build as `TAURI_SIGNING_PRIVATE_KEY` (+ optional password). `.env` files are ignored — it must be a real env var.
2. Build with `createUpdaterArtifacts: true`. Tauri emits the NSIS installer plus a `.sig` file.
3. You publish the installer and a manifest the app can reach over HTTPS.
4. At runtime, `check()` fetches the manifest, compares `version`, verifies the signature against the embedded public key, downloads, and runs the installer.

Key facts:

- **Signature verification cannot be disabled.** Lose the private key and existing installs can never be updated again — they must be reinstalled by hand. Back it up.
- Two manifest flavors:
  - **Static JSON** — one file with `version`, `notes`, `pub_date`, and a `platforms` map keyed `windows-x86_64` containing `signature` and `url`. Tauri validates the *whole* file before reading `version`, so a broken entry for any platform breaks all clients.
  - **Dynamic endpoint** — your server returns `204 No Content` for "up to date" or `200` with the same fields. Enables staged rollout, channels, forced downgrade.
- Windows `installMode`: use `"passive"` (small progress UI, no prompts). `"quiet"` only works if the app already runs elevated. On Windows the app is force-exited before the installer runs; use the `on_before_exit` hook to flush state.
- Commands are permission-gated — add `updater:default` to the capability file.
- Needs Rust >= 1.77.2. Supported on Windows, macOS, Linux, iOS, Android.
- Note as of `tauri-action` recent releases: `latest.json` now also carries `{os}-{arch}-{installer}` keys, which requires `tauri-plugin-updater` >= 2.10.0. Pin recent versions of both.

**Important for Stewrd:** the updater replaces the app via the NSIS installer. Stewrd is currently *not* installed — `build-release.bat` robocopies loose files into `C:\Utilities\stewrd`, including `plugins/` and user-customizable `assets/`. Adopting the updater means switching to an installed app and deciding where plugins/assets live (ideally `%APPDATA%`, not next to the exe, so the installer never clobbers them). This migration is the real work; the updater wiring itself is a couple of hours.

## Option 1: Tauri Updater + GitHub Releases

Publish a tagged release with the NSIS installer and `latest.json` via `tauri-action` (`includeUpdaterJson: true`), point the updater endpoint at the release asset URL.

**Pros**

- Zero hosting cost, zero infrastructure.
- `tauri-action` generates and uploads `latest.json` and signs artifacts for you.
- Release notes, history, and rollback are free side effects.
- **Once the repo is public, release assets are plain HTTPS URLs — no auth, no proxy, no token to manage.** This removes what was previously the main objection to this option.

**Cons**

- **While the repo is still private**, release assets require an authenticated request and the updater can't use a bare public URL. Workarounds until the repo goes public: (a) use a separate public releases-only repo, (b) ship a read-only PAT baked into request headers — weak, extractable, avoid, (c) front it with a Cloudflare Worker proxy holding the token.
- Version bump has to be scripted or remembered.

**Effort:** ~half a day once the repo is public. While private, add ~2 hours for a Worker proxy or use a releases-only public repo instead.

**This is the recommended long-term option once Stewrd goes public** — see Recommendation below.

## Option 2: Tauri Updater + Self-Hosted Static JSON

Put `latest.json` and the installer on any static host — Cloudflare R2/Pages, S3+CloudFront, Netlify, or a folder on a VPS/NAS. `build-release.bat` gains an upload step.

**Pros**

- Works regardless of repo visibility; no auth games.
- Full control of the URL; trivial to point at a local network share or internal host for a single-user/dev scenario.
- Cloudflare R2 has no egress fees; realistically $0–1/month at this size.

**Cons**

- One more thing to own (bucket, DNS, cache invalidation — set short TTL on `latest.json`).
- You hand-maintain the JSON unless you script it (copying `version`, `url`, and the contents of the `.sig` file).

**Effort:** ~half a day including a small PowerShell/Node script to emit `latest.json` and upload.

## Option 3: Dynamic Update Server

A ~50-line Cloudflare Worker / Lambda that reads a KV entry and returns `204` or the update JSON.

**Pros**

- Channels (stable/beta), staged rollout, kill-switch, per-version notes.
- Can also solve the private-GitHub-asset problem by proxying with a server-side token.

**Cons**

- Overkill for a single-user desktop app today. Pure YAGNI unless Stewrd gets external users.

**Effort:** ~1 day.

## Option 4: Third-Party Update Services

- **Crabnebula Cloud** — from the Tauri maintainers; CDN distribution, signing, release channels, download analytics, first-class Tauri integration. Free tier for small/OSS projects, paid beyond that. Lowest-effort managed option if you want to skip hosting entirely.
- **Velopack / Squirrel-style installers** — good delta updates, but they replace Tauri's bundler flow; fighting the framework for no gain here.
- **Generic (Keygen, Cloudsmith, etc.)** — fine as artifact hosts, but they're just Option 2 with an invoice.

**Effort:** a few hours (mostly account setup) for Crabnebula.

## Windows Code Signing

Two separate signatures, often confused:

| | Purpose | Required? |
|---|---|---|
| Tauri updater signature (minisign) | Proves the update package came from you; verified by the app | **Mandatory** for the updater; free |
| Authenticode code signing | Suppresses SmartScreen / "Unknown publisher" warnings on the installer | Optional; costs money |

Without Authenticode, every update installer download can trip SmartScreen and show an unsigned-publisher prompt. For a personal deploy to your own machine this is tolerable. For anyone else, it's a bad experience.

Costs as of 2026:

- **Azure Artifact Signing** (renamed from Trusted Signing) — from **$9.99/month** (5,000 signatures), keys in an HSM, no USB token, clean CI integration. Restricted to verified US/Canada/EU/UK businesses and, since 2026, self-employed individuals. This is the cheapest credible path.
- **OV certificate** — ~$200–500/year, plus a mandatory hardware token ($90–250) since the 2023 CA/B key-storage rules, or a cloud-HSM signing add-on.
- **EV certificate** — ~$400–700/year. **No longer bypasses SmartScreen** (that behavior was removed in 2024), so there's no reason to pay the EV premium for this use case.

SmartScreen reputation accrues per signing identity over downloads/time, so signing early with a stable identity is worth more than the cert tier.

**Other platforms if Stewrd ever ships beyond Windows:** macOS needs an Apple Developer Program membership ($99/year) for signing *and* notarization — unnotarized apps are effectively unlaunchable, and the Tauri updater on macOS ships `.app.tar.gz` bundles. Linux uses AppImage for updater support (no signing authority needed). Neither should influence today's decision; both are additive later.

## Plugin Auto-Update

Stewrd already discovers and esbuild-bundles plugins at runtime from `plugins/`, and `build-release.bat` mirrors them into the deploy dir. That is a separate, much cheaper problem than app updates:

- Plugins are JS bundles + a manifest, not signed native binaries, so they can be fetched and swapped without any installer or certificate.
- A minimal version: each plugin manifest gains a `version` and optional `updateUrl`; the host fetches a small registry JSON, compares versions, downloads the `dist/index.js` into the plugin dir, and reloads. Verify with a hash from the registry at minimum.
- Do this **after** the app updater, and make sure plugins live outside the installed program directory first (`%APPDATA%\stewrd\plugins`) — otherwise an app update wipes or conflicts with them. That relocation is a prerequisite for both features, so do it once, early.

## Recommendation

**Target `tauri-plugin-updater` + GitHub Releases via `tauri-action` (Option 1), timed to when the repo goes public.** It's the first-party path, zero hosting cost, and once the repo is public there's no auth problem to work around — `tauri-action` handles signing and manifest generation for you as part of a tagged release.

**Until the repo is public**, use Option 2 (static `latest.json` on Cloudflare R2) as a bridge, or a releases-only public repo — either avoids the private-asset auth issue without waiting. Since the R2 setup work (keypair, `tauri.conf.json`, capabilities, `build-release.bat` wiring) is nearly identical either way, it's reasonable to build against R2 now and swap the endpoint to the GitHub Releases URL once public — the switch is a one-line config change, not a redo.

A dynamic server (Option 3) buys features Stewrd has no use for with one user. Crabnebula (Option 4) is the right answer only if you'd rather pay than own a bucket or manage releases yourself.

Suggested order:

1. **Move user data out of the program dir** → verify: plugins and `assets/` resolve from `%APPDATA%\stewrd`, app still runs after deleting the install folder's copies.
2. **Switch the deploy to a real NSIS install** (run the bundled installer instead of robocopy) → verify: app installs, launches, and upgrades cleanly over itself.
3. **Generate the signing keypair, back up the private key**, add the public key + `endpoints` + `installMode: "passive"` to `tauri.conf.json`, enable `createUpdaterArtifacts`, add `updater:default` to capabilities → verify: `npx tauri build` emits `.sig` files.
4. **Script version bump + `latest.json` emit** in `build-release.bat`, uploading to R2 for now → verify: `latest.json` is fetchable over HTTPS and its signature matches the artifact.
5. **Wire a UI check** (startup check + a manual "Check For Updates" action; route failures to the status bar like other exceptions) → verify: an older local build detects and installs the newer release end to end.
6. **When the repo goes public**, switch to `tauri-action` in a GitHub Actions workflow and point the updater endpoint at the release asset URL instead of R2 → verify: a tagged release produces a working `latest.json` and installer as release assets, old build updates from it.
7. **Defer** Authenticode signing until Stewrd is distributed to someone other than you; when that happens, Azure Artifact Signing at $9.99/month.
8. **Defer** plugin auto-update until after step 1 lands.

## Sources

- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri v2 GitHub Actions Pipeline](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [tauri-action Releases](https://github.com/tauri-apps/tauri-action/releases)
- [Code Signing Options For Windows App Developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [SmartScreen Reputation For Windows App Developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Code Signing On Windows With Azure Trusted Signing](https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/)
