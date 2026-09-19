# Rules

## MANDATORY
- **NEVER** specify a color manually, instead **ALWAYS** select a variable from the color palette to identify a color so that it is controllable by theme changes
- All titles and button text should be Title case. IE: "Create New Palette", NOT "Create new palette"

## Component Library
- Any new plugin-facing feature — a component under `src/components/` registered in `api.ui`, a new `api.*` surface, a new `ctx` capability, or a new manifest/settings field — **MUST** ship a corresponding example in `plugins/_template` (a `demos/` file for components, an `index.tsx`/README snippet for other surfaces) in the same change.
- Shared components live under `src/components/<Name>/<Name>.tsx`, source colors only from `Palette` fields (or values derived from them), and are wired to plugins via `src/shared/plugin-api.d.ts` + `plugins/.stewrd/plugin-api.d.ts` (hand-synced) + `src/host/api/createPluginApi.ts`.

## General
- When changes are completed in this project **ALWAYS** do the following:
    - Determine if the changes are significant enough to warrant adding to README.md
    - Commit and push directly to main branch (do **NOT** create a pull request)
    - Execute ./build-release.bat
- README.md is a good source to look for details around this project
- Plugins exist in ./plugins and should contain a README.md in their individual folders