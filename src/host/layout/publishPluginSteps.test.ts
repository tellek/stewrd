import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { PUBLISH_STEPS, appendCatalogEntry, fromBase64, parseGithubRemote, preflight, toBase64, type CatalogEntry } from "./publishPluginSteps";

type Result = { code: number; stdout: string; stderr: string; timedOut: boolean };
const ok = (stdout = ""): Result => ({ code: 0, stdout, stderr: "", timedOut: false });
const bad = (stderr: string): Result => ({ code: 1, stdout: "", stderr, timedOut: false });

function route(handlers: Record<string, Result>) {
  invokeMock.mockImplementation(async (cmd: string, payload: { program?: string; args?: string[] }) => {
    if (cmd !== "run_command_timeout") return undefined;
    const line = `${payload.program} ${(payload.args ?? []).join(" ")}`;
    const key = Object.keys(handlers).find((k) => line.startsWith(k));
    return key ? handlers[key] : bad(`unexpected: ${line}`);
  });
}
const calls = () =>
  invokeMock.mock.calls.filter(([c]) => c === "run_command_timeout").map(([, p]) => `${p.program} ${p.args.join(" ")}`);

const entry: CatalogEntry = { id: "cool", name: "Cool", description: "d", repo: "octo/stewrd-cool", apiVersion: "1", category: "Utilities" };
const plugin = { dir: "cool", id: "cool", name: "Cool", description: "d", apiVersion: "1", category: "Utilities" };

beforeEach(() => invokeMock.mockReset());

describe("helpers", () => {
  it("parses https and ssh GitHub remotes", () => {
    expect(parseGithubRemote("https://github.com/octo/stewrd-cool.git\n")).toBe("octo/stewrd-cool");
    expect(parseGithubRemote("git@github.com:octo/stewrd-cool.git")).toBe("octo/stewrd-cool");
    expect(parseGithubRemote("https://gitlab.com/o/r.git")).toBeNull();
  });

  it("round-trips UTF-8 through base64", () => {
    expect(fromBase64(toBase64("héllo ✓"))).toBe("héllo ✓");
  });

  it("appends one entry with 2-space indent and a trailing newline, and is idempotent", () => {
    const text = JSON.stringify([{ ...entry, id: "other" }], null, 2) + "\n";
    const out = appendCatalogEntry(text, entry)!;
    expect(JSON.parse(out).map((e: CatalogEntry) => e.id)).toEqual(["other", "cool"]);
    expect(out.endsWith("]\n")).toBe(true);
    expect(appendCatalogEntry(out, entry)).toBeNull();
  });
});

describe("preflight", () => {
  const healthy = {
    "gh api user --jq": ok("octo\n"),
    "git -C": ok("https://github.com/octo/stewrd-cool.git\n"),
    "gh api repos/octo/stewrd-cool --jq": ok("false"),
    "gh api repos/octo/stewrd-cool/releases/latest": ok("1"),
  };
  const sep = "C:\\app\\plugins";

  it("passes and builds the catalog entry from the plugin's own origin repo", async () => {
    route(healthy);
    const res = await preflight(plugin, sep, new Set());
    expect(res.ok).toBe(true);
    expect(res.entry).toEqual(entry);
  });

  it("collects every problem: private repo, no zip, already listed, no category", async () => {
    route({ ...healthy, "gh api repos/octo/stewrd-cool --jq": ok("true"), "gh api repos/octo/stewrd-cool/releases/latest": ok("0") });
    const res = await preflight({ ...plugin, category: "" }, sep, new Set(["cool"]));
    expect(res.ok).toBe(false);
    const text = res.problems.join(" | ");
    expect(text).toMatch(/must be public/);
    expect(text).toMatch(/no \.zip asset/);
    expect(text).toMatch(/already in the marketplace/);
    expect(text).toMatch(/category/);
  });

  it("fails when the plugin is not a GitHub clone, and when gh is signed out", async () => {
    route({ ...healthy, "git -C": bad("fatal: no such remote") });
    expect((await preflight(plugin, sep, new Set())).problems.join(" ")).toMatch(/isn't a git clone/);
    route({ "gh api user --jq": bad("not logged in") });
    expect((await preflight(plugin, sep, new Set())).problems[0]).toMatch(/gh auth login/);
  });
});

describe("PUBLISH_STEPS", () => {
  const step = (k: string) => PUBLISH_STEPS.find((s) => s.key === k)!;

  it("branches directly on the host repo when the user owns it (no fork)", async () => {
    route({ "gh api repos/tellek/stewrd/git/ref": ok("abc123\n"), "gh api -X POST": ok() });
    const ctx = { owner: "tellek", entry };
    await step("branch").run(ctx);
    expect(calls().some((l) => l.startsWith("gh repo fork"))).toBe(false);
    expect(calls().find((l) => l.includes("-X POST"))).toContain("repos/tellek/stewrd/git/refs");
    expect(ctx).toMatchObject({ headRepo: "tellek/stewrd", branch: "add-plugin-cool" });
  });

  it("forks, uses the fork's real name, and branches from upstream main's SHA", async () => {
    route({
      "gh repo fork": ok(),
      "gh api repos/tellek/stewrd/forks": ok("octo/stewrd-1\n"),
      "gh api repos/octo/stewrd-1/git/ref": ok("old\n"),
      "gh api repos/tellek/stewrd/git/ref": ok("upstream-sha\n"),
      "gh api -X POST": ok(),
    });
    const ctx: { owner: string; entry: CatalogEntry; headRepo?: string } = { owner: "octo", entry };
    await step("branch").run(ctx);
    expect(ctx.headRepo).toBe("octo/stewrd-1");
    expect(calls().find((l) => l.includes("-X POST"))).toContain("sha=upstream-sha");
  });

  it("tolerates an already-existing branch on retry", async () => {
    invokeMock.mockImplementation(async (_c: string, p: { args: string[] }) =>
      p?.args?.includes("POST") ? bad("Reference already exists") : ok("abc\n"),
    );
    await expect(step("branch").run({ owner: "tellek", entry })).resolves.toBeUndefined();
  });

  it("adds the entry to the branch's catalog file with the file's sha", async () => {
    const existing = JSON.stringify([{ ...entry, id: "other" }], null, 2) + "\n";
    route({ "gh api repos/octo/stewrd/contents/docs/plugin-catalog.json?ref=": ok(`filesha ${toBase64(existing)}\n`), "gh api -X PUT": ok() });
    await step("catalog").run({ owner: "octo", entry, headRepo: "octo/stewrd", branch: "add-plugin-cool" });
    const put = invokeMock.mock.calls.map(([, p]) => p?.args as string[]).find((a) => a?.includes("PUT"))!;
    expect(put).toContain("sha=filesha");
    expect(put).toContain("branch=add-plugin-cool");
    const content = put.find((a) => a.startsWith("content="))!.slice("content=".length);
    expect(JSON.parse(fromBase64(content)).map((e: CatalogEntry) => e.id)).toEqual(["other", "cool"]);
  });

  it("does not write again when the entry is already on the branch", async () => {
    const existing = JSON.stringify([entry], null, 2) + "\n";
    route({ "gh api repos/octo/stewrd/contents": ok(`filesha ${toBase64(existing)}\n`) });
    await step("catalog").run({ owner: "octo", entry, headRepo: "octo/stewrd", branch: "b" });
    expect(calls().some((l) => l.includes("PUT"))).toBe(false);
  });

  it("opens the PR against the host repo and returns its URL, reusing an open one on retry", async () => {
    route({ "gh pr list": ok(""), "gh pr create": ok("https://github.com/tellek/stewrd/pull/9\n") });
    const ctx: { owner: string; entry: CatalogEntry; branch: string; prUrl?: string } = { owner: "octo", entry, branch: "add-plugin-cool" };
    await step("pr").run(ctx);
    expect(ctx.prUrl).toBe("https://github.com/tellek/stewrd/pull/9");
    expect(calls().find((l) => l.startsWith("gh pr create"))).toContain("--head octo:add-plugin-cool");

    invokeMock.mockReset();
    route({ "gh pr list": ok("https://github.com/tellek/stewrd/pull/9\n") });
    const again: { owner: string; entry: CatalogEntry; branch: string; prUrl?: string } = { owner: "octo", entry, branch: "add-plugin-cool" };
    await step("pr").run(again);
    expect(again.prUrl).toBe("https://github.com/tellek/stewrd/pull/9");
    expect(calls().some((l) => l.startsWith("gh pr create"))).toBe(false);
  });
});
