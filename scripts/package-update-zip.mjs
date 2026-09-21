#!/usr/bin/env node
// Stages a filtered copy of src-tauri/target/release (same exclusions as
// build-release.bat's own robocopy) plus assets/, then zips it as
// stewrd-v<version>-windows.zip with stewrd.exe and assets/ at the zip root -
// the exact layout src-tauri/src/commands/updates.rs's extract_zip_flat
// expects. Used by .github/workflows/release.yml; mirrors the manual process
// previously documented in README.md §9a.
//
// Usage: node scripts/package-update-zip.mjs <version>
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version) {
  console.error("Usage: package-update-zip <version>");
  process.exit(1);
}

const releaseDir = path.join(repoRoot, "src-tauri", "target", "release");
const stagingDir = path.join(repoRoot, "update-zip-staging");
const zipName = `stewrd-v${version}-windows.zip`;
const zipPath = path.join(repoRoot, zipName);

const EXCLUDED_FILE_SUFFIXES = [".pdb", ".lib", ".exp", ".rlib"];
const EXCLUDED_DIR_NAMES = new Set([
  "deps",
  "build",
  "incremental",
  ".fingerprint",
  "examples",
  "wix",
  "nsis",
  "bundle",
  "assets", // copied separately below, from the same source
]);

function copyFiltered(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      copyFiltered(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    } else {
      if (EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
      fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }
}

if (!fs.existsSync(path.join(releaseDir, "stewrd.exe"))) {
  console.error(`package-update-zip: ${releaseDir}\\stewrd.exe not found - run "npx tauri build" first`);
  process.exit(1);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
copyFiltered(releaseDir, stagingDir);

const assetsSrc = path.join(releaseDir, "assets");
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(stagingDir, "assets"), { recursive: true });
}

fs.rmSync(zipPath, { force: true });
// PowerShell's Compress-Archive is available on every GitHub windows-latest
// runner (and locally) with no extra dependency - zips stagingDir's
// *contents* (trailing \* ) at the archive root, not the staging folder itself.
execFileSync(
  "powershell",
  ["-NoProfile", "-Command", `Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${zipPath}" -Force`],
  { stdio: "inherit" }
);

fs.rmSync(stagingDir, { recursive: true, force: true });
console.log(`package-update-zip: wrote ${zipName}`);
