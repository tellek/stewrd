#!/usr/bin/env node
// Merges each plugin's source settings.json into its deployed settings.json.
//
// settings.json holds a mix of fields: `version` is host-owned (only bumped
// by editing source) and must always come from source, but `category` and
// everything else are user-editable at runtime (Configure, or dragging a
// plugin to a different sidebar category via setPluginCategoryFile) and live
// only in the deployed copy - they must survive a rebuild untouched. Run
// after build-release.bat's per-plugin robocopy loop, which deliberately
// excludes settings.json from that mirror so this script is the only thing
// that writes it in deploy.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePluginsDir = path.join(repoRoot, "plugins");
const deployPluginsDir = process.env.STEWRD_DEPLOY_PLUGINS_DIR ?? "C:\\Utilities\\stewrd\\plugins";

const SKIP = new Set([".stewrd", "__host__"]);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

for (const id of fs.readdirSync(sourcePluginsDir)) {
  if (SKIP.has(id)) continue;
  const sourceDir = path.join(sourcePluginsDir, id);
  if (!fs.statSync(sourceDir).isDirectory()) continue;

  const sourceSettingsPath = path.join(sourceDir, "settings.json");
  const source = readJson(sourceSettingsPath);
  if (!source) continue; // plugin ships no settings.json - nothing to merge

  const deployDir = path.join(deployPluginsDir, id);
  if (!fs.existsSync(deployDir)) continue; // plugin wasn't deployed (e.g. .stewrd-only artifacts)
  const deploySettingsPath = path.join(deployDir, "settings.json");
  const deployed = readJson(deploySettingsPath);

  const merged = deployed
    ? { ...deployed, version: source.version } // keep deployed's category/etc; only version always comes from source
    : source; // first-ever deploy of this plugin - just take source as-is

  fs.writeFileSync(deploySettingsPath, JSON.stringify(merged, null, 2));
}
