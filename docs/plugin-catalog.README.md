# Plugin catalog

`plugin-catalog.json` in this folder is fetched live by the Marketplace
plugin (`https://raw.githubusercontent.com/tellek/stewrd/main/docs/plugin-catalog.json`)
- adding a plugin to the marketplace is a PR to this file, no stewrd code
change needed.

## Entry shape

```json
{
  "id": "cool-plugin",
  "name": "Cool Plugin",
  "description": "One-line summary shown in the list",
  "repo": "someauthor/cool-stewrd-plugin",
  "apiVersion": "1",
  "category": "Productivity"
}
```

`repo` always resolves to that repo's *current* `releases/latest` at
install/update time - no release/version/asset URL is duplicated here, so
this file never goes stale relative to the author's own releases.

## Trust model (v1)

Approving an entry here is an ongoing trust relationship with that repo, not
a one-time review of pinned bytes - installs always run whatever code is in
the author's current release. This is the same trust level already extended
to any installed plugin (`api.shell` is fully trusted, no allowlist), just
made explicit to the user via a confirmation modal naming the repo/tag before
every install. A future hardening pass could let an entry optionally pin a
`tag` + `sha256`, with the marketplace preferring the pinned tag and
verifying the hash before install - out of scope for v1.
