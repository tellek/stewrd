#!/usr/bin/env node
// Standalone plugin build script shipped with the installed app (see
// CLAUDE.md in this same folder) - a self-contained copy of the repo's
// scripts/stewrd-plugin-build.mjs, usable from just <install>/plugins/ with
// a local `npm install esbuild` (no dependency on the rest of the repo's
// node_modules/scripts, which a real install doesn't have).
//
// Usage: node build-plugin.mjs <pluginDir> [--watch]
import * as esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";

const [, , pluginDirArg, ...rest] = process.argv;
const watch = rest.includes("--watch");

if (!pluginDirArg) {
  console.error("Usage: build-plugin <pluginDir> [--watch]");
  process.exit(1);
}

const pluginDir = path.resolve(pluginDirArg);
const candidates = ["index.tsx", "index.ts", "index.jsx", "index.js"];
const entry = candidates
  .map((name) => path.join(pluginDir, name))
  .find((p) => fs.existsSync(p));

if (!entry) {
  console.error(`No entry file found in ${pluginDir} (looked for ${candidates.join(", ")})`);
  process.exit(1);
}

const outfile = path.join(pluginDir, "dist", "index.js");

const buildOptions = {
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  sourcemap: true,
  // react/react-dom: share the host's single instance (see the host's import
  // map). @tauri-apps/api/*: escape hatch for advanced plugins needing raw
  // invoke()/listen() beyond the standard PluginApi surface - shared the
  // same way.
  external: ["react", "react-dom", "react-dom/*", "react/*", "@tauri-apps/api/*"],
  // Image imports (e.g. `import icon from "./assets/foo.png"`) inline as
  // base64 data URLs at build time - plugin bundles load from a Blob URL at
  // runtime, so relative asset paths would never resolve otherwise.
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".jpeg": "dataurl", ".svg": "dataurl", ".gif": "dataurl" },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log(`build-plugin: watching ${path.relative(process.cwd(), pluginDir)}`);
} else {
  await esbuild.build(buildOptions);
}
