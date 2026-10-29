#!/usr/bin/env node
// Builds templates/hello/dist/index.js, the prebuilt bundle embedded into the
// binary (src-tauri/src/commands/plugin_scaffold.rs, include_str!) so the
// "Create New Plugin" wizard can drop a working plugin into an install that
// has no esbuild. Same esbuild options as scripts/stewrd-plugin-build.mjs,
// minus the sourcemap (the committed output should stay a single small file).
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(repoRoot, "templates", "hello");

await esbuild.build({
  entryPoints: [path.join(dir, "index.tsx")],
  outfile: path.join(dir, "dist", "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react-dom/*", "react/*", "@tauri-apps/api/*"],
  logLevel: "info",
});
