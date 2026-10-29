# __PLUGIN_NAME__

A Stewrd plugin created from the Hello World template.

## Develop

From the Stewrd `plugins/` folder (one-time `npm install esbuild`):

```sh
node build-plugin.mjs __PLUGIN_ID__ --watch
```

Stewrd hot-reloads the plugin on every rebuild. See `plugins/CLAUDE.md` for the full plugin API, or open this folder with an AI coding assistant and ask it to build something.

## Release

Push a `v<version>` tag (matching `version` in `settings.json`); the included GitHub Actions workflow attaches a zip to the release so the plugin can be installed from the Marketplace.
