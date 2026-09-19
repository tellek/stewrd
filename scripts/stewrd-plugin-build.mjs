#!/usr/bin/env node
// Shared esbuild wrapper for building a plugin's dist/index.js.
// Usage: node scripts/stewrd-plugin-build.mjs <pluginDir> [--watch]
//
// Bundles the plugin's entire file tree into a single ESM file so every
// relative import is resolved/inlined at build time (no runtime relative
// imports survive into the Blob-URL-loaded output). react/react-dom and
// their subpaths (jsx-runtime included) stay external so the plugin shares
// the host's single React instance via the import map.
import * as esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";

const [, , pluginDirArg, ...rest] = process.argv;
const watch = rest.includes("--watch");

if (!pluginDirArg) {
  console.error("Usage: stewrd-plugin-build <pluginDir> [--watch]");
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
  // react/react-dom: share the host's single instance (see import map).
  // @tauri-apps/api/*: escape hatch for advanced plugins needing raw
  // invoke()/listen() beyond the standard PluginApi surface (e.g. Git
  // Tracker's Rust-interval-driven background poll) - shared the same way.
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
  console.log(`stewrd-plugin-build: watching ${path.relative(process.cwd(), pluginDir)}`);
} else {
  await esbuild.build(buildOptions);
}
