#!/usr/bin/env node
// Standalone plugin build script shipped with the installed app (see
// CLAUDE.md in this same folder) - a self-contained copy of the repo's
// scripts/stewrd-plugin-build.mjs, usable from just <install>/plugins/ with
// a local `npm install esbuild` (no dependency on the rest of the repo's
// node_modules/scripts, which a real install doesn't have).
//
// Usage: node build-plugin.mjs <pluginDir> [--watch]
//        node build-plugin.mjs new <id> ["Display Name"]
//
// esbuild is imported lazily (build/watch only) so `new` works before
// `npm install esbuild` has been run.
import path from "node:path";
import fs from "node:fs";

const [, , pluginDirArg, ...rest] = process.argv;
const watch = rest.includes("--watch");

if (!pluginDirArg) {
  console.error("Usage: build-plugin <pluginDir> [--watch]\n       build-plugin new <id> [\"Display Name\"]");
  process.exit(1);
}

if (pluginDirArg === "new") {
  const [id, ...nameParts] = rest;
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || RESERVED.test(id)) {
    console.error('Usage: build-plugin new <id> ["Display Name"]  (id: lowercase letters, digits and hyphens)');
    process.exit(1);
  }
  const name = nameParts.join(" ").trim() || id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  if (/["\\\u0000-\u001f]/.test(name)) {
    console.error("The display name can't contain quotes, backslashes or control characters.");
    process.exit(1);
  }
  const dest = path.resolve(id);
  if (fs.existsSync(dest)) {
    console.error(`${dest} already exists.`);
    process.exit(1);
  }
  const { files } = await import("./hello-template.mjs");
  const quotedName = JSON.stringify(name).slice(1, -1);
  for (const f of files) {
    const out = path.join(dest, f.path);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.content.replaceAll("__PLUGIN_ID__", id).replaceAll("__PLUGIN_NAME__", f.quoted ? quotedName : name));
  }
  console.log(`Created ${dest}\nNext: node build-plugin.mjs ${id} --watch`);
  process.exit(0);
}

const esbuild = await import("esbuild");

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
  // Inline: the host loads the bundle from a Blob URL, so an external
  // index.js.map next to it could never be resolved.
  sourcemap: "inline",
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
