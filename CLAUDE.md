# Rules

## MANDATORY
- **NEVER** specify a color manually, instead **ALWAYS** select a variable from the color palette to identify a color so that it is controllable by theme changes
- All titles and button text should be Title case. IE: "Create New Palette", NOT "Create new palette"

## Component Library
- Any new plugin-facing feature — a component under `src/components/` registered in `api.ui`, a new `api.*` surface, a new `ctx` capability, or a new manifest/settings field — **MUST** ship a corresponding example in `plugins/_template` (a `demos/` file for components, an `index.tsx`/README snippet for other surfaces) in the same change.
- Shared components live under `src/components/<Name>/<Name>.tsx`, source colors only from `Palette` fields (or values derived from them), and are wired to plugins via `src/shared/plugin-api.d.ts` + `plugins/.stewrd/plugin-api.d.ts` (hand-synced) + `src/host/api/createPluginApi.ts`.

## General
- When changes are completed in this project **ALWAYS** do the following:
    1. Always update ARCHITECTURE.md to reflect the change (architecture, API surfaces, mechanisms); only touch README.md if the change is significant enough to affect the human-facing overview (new feature, changed usage/getting-started steps, etc.)
    2. Extecute all tests, fix any that are broken by fixing the related code, not the test(unless the test code truly is broken)
    3. Commit and push directly to main branch (do **NOT** create a pull request)
    4. Execute ./build-release.bat
- ARCHITECTURE.md is a good source to look for details around this project
- Plugins exist in ./plugins and should contain a README.md in their individual folders

## Notes
- build-release.bat is for internal use on this PC only and not meant to ship with the application. It's purpose is simply to immediatly update where I run the app from when building release