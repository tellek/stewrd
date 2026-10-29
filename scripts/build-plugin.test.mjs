// Exercises the shipped plugins/build-plugin.mjs `new` and `pack` commands end
// to end in a temp dir (no esbuild needed for either).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "plugins", "build-plugin.mjs");
let work;

const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: work, encoding: "utf8" });

/** Reads every entry of a zip via its central directory (stored or deflated). */
function readZip(file) {
  const buf = fs.readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8");
    p += 46 + nameLen;
  }
  return out;
}

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "stewrd-build-plugin-"));
});
afterEach(() => fs.rmSync(work, { recursive: true, force: true }));

describe("build-plugin new", () => {
  it("scaffolds the Hello World plugin with the id and display name filled in", () => {
    const res = run("new", "my-plugin", "My Plugin");
    expect(res.status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(work, "my-plugin", "plugin.json"), "utf8"));
    expect(manifest).toMatchObject({ id: "my-plugin", name: "My Plugin", entry: "dist/index.js" });
    expect(fs.readFileSync(path.join(work, "my-plugin", "dist", "index.js"), "utf8")).toContain("My Plugin");
    expect(fs.existsSync(path.join(work, "my-plugin", ".github", "workflows", "release.yml"))).toBe(true);
  });

  it("rejects bad ids, reserved names, unsafe display names and existing folders", () => {
    expect(run("new", "Bad_ID").status).toBe(1);
    expect(run("new", "con").status).toBe(1);
    expect(run("new", "ok", 'Bad "Name"').status).toBe(1);
    expect(run("new", "dup").status).toBe(0);
    expect(run("new", "dup").status).toBe(1);
  });
});

describe("build-plugin pack", () => {
  it("writes <id>.zip with a top-level <id>/ folder and only shippable files", () => {
    run("new", "my-plugin", "My Plugin");
    fs.writeFileSync(path.join(work, "my-plugin", "dist", "index.js.map"), "{}");
    fs.mkdirSync(path.join(work, "my-plugin", "node_modules"));
    fs.writeFileSync(path.join(work, "my-plugin", "node_modules", "junk.js"), "x");
    const res = run("pack", "my-plugin");
    expect(res.status).toBe(0);
    const zip = readZip(path.join(work, "my-plugin.zip"));
    expect(Object.keys(zip).sort()).toEqual([
      "my-plugin/README.md",
      "my-plugin/dist/index.js",
      "my-plugin/plugin.json",
      "my-plugin/settings.json",
    ]);
    expect(JSON.parse(zip["my-plugin/plugin.json"]).id).toBe("my-plugin");
  });

  it("refuses a missing build, an id/folder mismatch and a bad apiVersion", () => {
    run("new", "my-plugin");
    fs.rmSync(path.join(work, "my-plugin", "dist"), { recursive: true });
    expect(run("pack", "my-plugin").stderr).toMatch(/built entry .* is missing/);

    run("new", "other");
    fs.renameSync(path.join(work, "other"), path.join(work, "renamed"));
    expect(run("pack", "renamed").stderr).toMatch(/must match the folder name/);

    run("new", "badapi");
    const file = path.join(work, "badapi", "plugin.json");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"apiVersion": "1"', '"apiVersion": "2"'));
    expect(run("pack", "badapi").stderr).toMatch(/apiVersion/);
  });

  it("warns when settings.json has no version", () => {
    run("new", "nover");
    fs.writeFileSync(path.join(work, "nover", "settings.json"), '{"category":"Utilities"}');
    const res = run("pack", "nover");
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/no "version"/);
  });
});

