#!/usr/bin/env node
// Standalone plugin build script shipped with the installed app (see
// CLAUDE.md in this same folder) - a self-contained copy of the repo's
// scripts/stewrd-plugin-build.mjs, usable from just <install>/plugins/ with
// a local `npm install esbuild` (no dependency on the rest of the repo's
// node_modules/scripts, which a real install doesn't have).
//
// Usage: node build-plugin.mjs <pluginDir> [--watch]
//        node build-plugin.mjs new <id> ["Display Name"]
//        node build-plugin.mjs pack <pluginDir>     (validates, writes <id>.zip)
//
// esbuild is imported lazily (build/watch only) so `new` works before
// `npm install esbuild` has been run.
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

const [, , pluginDirArg, ...rest] = process.argv;
const watch = rest.includes("--watch");

if (!pluginDirArg) {
  console.error(
    [
      "Usage: build-plugin <pluginDir> [--watch]",
      '       build-plugin new <id> ["Display Name"]',
      "       build-plugin pack <pluginDir>",
    ].join("\n"),
  );
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

if (pluginDirArg === "pack") {
  await pack(rest[0]);
  process.exit(0);
}

// ---- pack: validate a plugin folder and write <id>.zip (no zip tool or
// Python needed: a minimal zip writer lives below). The zip holds a single
// top-level <id>/ folder, which Settings > Plugins > Add Plugin and the
// Marketplace installer both accept.
async function pack(dirArg) {
  if (!dirArg) {
    console.error("Usage: build-plugin pack <pluginDir>");
    process.exit(1);
  }
  const dir = path.resolve(dirArg);
  const fail = (msg) => {
    console.error(`pack: ${msg}`);
    process.exit(1);
  };
  if (!fs.existsSync(path.join(dir, "plugin.json"))) fail(`${dir} has no plugin.json`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8"));
  } catch (e) {
    fail(`plugin.json is not valid JSON: ${e.message}`);
  }
  const id = path.basename(dir);
  if (manifest.id !== id) fail(`plugin.json id "${manifest.id}" must match the folder name "${id}"`);
  if (manifest.apiVersion !== "1") fail(`apiVersion must be "1" (got "${manifest.apiVersion}")`);
  if (!manifest.entry || !fs.existsSync(path.join(dir, manifest.entry))) {
    fail(`built entry ${manifest.entry} is missing - run: node build-plugin.mjs ${id}`);
  }
  let version = "";
  try {
    version = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")).version ?? "";
  } catch {
    // settings.json is optional
  }
  if (!version) console.warn('pack: warning - settings.json has no "version"; the Marketplace can\'t detect updates without one');

  const entries = [];
  const add = (rel) => entries.push({ name: `${id}/${rel}`, data: fs.readFileSync(path.join(dir, rel)) });
  const walk = (rel) => {
    for (const item of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = `${rel}/${item.name}`;
      if (item.isDirectory()) walk(next);
      else if (!item.name.endsWith(".map")) add(next);
    }
  };
  for (const file of ["plugin.json", "settings.json", "icon.png", "README.md"]) {
    if (fs.existsSync(path.join(dir, file))) add(file);
  }
  if (fs.existsSync(path.join(dir, "dist"))) walk("dist");

  const out = path.resolve(`${id}.zip`);
  fs.writeFileSync(out, makeZip(entries));
  console.log(`Created ${out} (${entries.length} files${version ? `, version ${version}` : ""})`);
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
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
