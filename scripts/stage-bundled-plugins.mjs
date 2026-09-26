#!/usr/bin/env node
// Stages a filtered copy of each plugin that ships bundled with the app into
// bundled-plugins/<id>/ (gitignored, build-time only), which
// src-tauri/tauri.conf.json's bundle.resources points at.
//
// Only copies what a fresh install needs to run the plugin - plugin.json,
// dist/, icon.png - never settings.json or any data/storage.json. Those are
// live user-editable state under <plugins-dir>/<id>/ at runtime
// (plugin_settings.rs), and re-running the NSIS installer to upgrade would
// otherwise silently overwrite a user's saved settings back to defaults.
//
// Run before `npx tauri build` (and before build-release.bat's own
// `tauri build` call) - the plugin's dist/index.js must already exist, so
// this must also run after `npm run plugin:build -- plugins/<id>`.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Plugins that ship bundled with fresh installs. Keep in sync with
// tauri.conf.json's bundle.resources entries.
const BUNDLED_PLUGINS = ["notepad", "_template", "marketplace"];

// _template is a teaching example, not a functional plugin - it also ships
// its source (index.tsx, demos/, README.md, assets/) so an assistant working
// in an install's plugins/ folder (see plugins/CLAUDE.md) has a real
// reference to copy from, not just a working sidebar entry. Still never
// settings.json - see the note above.
const SOURCE_ENTRIES = new Set(["index.tsx", "demos", "README.md", "assets"]);

const ALLOWED_ENTRIES = new Set(["plugin.json", "dist", "icon.png"]);

function copyAllowed(srcDir, destDir, allowedEntries) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    if (!allowedEntries.has(entry)) continue;
    const src = path.join(srcDir, entry);
    const dest = path.join(destDir, entry);
    fs.cpSync(src, dest, { recursive: true });
  }
}

for (const id of BUNDLED_PLUGINS) {
  const srcDir = path.join(repoRoot, "plugins", id);
  const distIndex = path.join(srcDir, "dist", "index.js");
  if (!fs.existsSync(distIndex)) {
    console.error(`stage-bundled-plugins: ${distIndex} is missing - run "npm run plugin:build -- plugins/${id}" first`);
    process.exit(1);
  }
  const destDir = path.join(repoRoot, "bundled-plugins", id);
  const allowedEntries = id === "_template" ? new Set([...ALLOWED_ENTRIES, ...SOURCE_ENTRIES]) : ALLOWED_ENTRIES;
  copyAllowed(srcDir, destDir, allowedEntries);
  console.log(`stage-bundled-plugins: staged ${id} -> ${path.relative(repoRoot, destDir)}`);
}
