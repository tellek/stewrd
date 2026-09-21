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
const BUNDLED_PLUGINS = ["notepad"];

const ALLOWED_ENTRIES = new Set(["plugin.json", "dist", "icon.png"]);

function copyAllowed(srcDir, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    if (!ALLOWED_ENTRIES.has(entry)) continue;
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
  copyAllowed(srcDir, destDir);
  console.log(`stage-bundled-plugins: staged ${id} -> ${path.relative(repoRoot, destDir)}`);
}
