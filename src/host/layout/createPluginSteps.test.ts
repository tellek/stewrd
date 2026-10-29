import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { STEPS, checkName, checkPrerequisites, slugify, validateName } from "./createPluginSteps";

type Result = { code: number; stdout: string; stderr: string; timedOut: boolean };
const ok = (stdout = ""): Result => ({ code: 0, stdout, stderr: "", timedOut: false });
const bad = (stderr: string, code = 1): Result => ({ code, stdout: "", stderr, timedOut: false });

/** Routes run_command_timeout calls by "program arg arg" prefix; other commands go to `other`. */
function route(handlers: Record<string, Result | ((args: string[]) => Result)>, other: Record<string, unknown> = {}) {
  invokeMock.mockImplementation(async (cmd: string, payload: { program?: string; args?: string[] }) => {
    if (cmd === "run_command_timeout") {
      const line = `${payload.program} ${(payload.args ?? []).join(" ")}`;
      const key = Object.keys(handlers).find((k) => line.startsWith(k));
      if (!key) return bad(`unexpected command: ${line}`);
      const h = handlers[key];
      return typeof h === "function" ? h(payload.args ?? []) : h;
    }
    if (cmd in other) return other[cmd];
    return undefined;
  });
}

beforeEach(() => invokeMock.mockReset());

describe("slugify / validateName", () => {
  it("makes lowercase hyphenated ids", () => {
    expect(slugify("My Cool Plugin!")).toBe("my-cool-plugin");
    expect(slugify("  --A--  ")).toBe("a");
  });

  it("rejects empty, reserved, quoted and too-long names", () => {
    expect(validateName("")).not.toBeNull();
    expect(validateName("!!!")).not.toBeNull();
    expect(validateName("con")).toMatch(/reserved/);
    expect(validateName('Bad "Name"')).not.toBeNull();
    expect(validateName("x".repeat(61))).not.toBeNull();
    expect(validateName("Good Name")).toBeNull();
  });
});

describe("checkPrerequisites", () => {
  const healthy = {
    "gh auth status": ok(),
    "gh api user --jq": ok("octo\n"),
    "gh api -i user": ok("HTTP/2.0 200 OK\nX-Oauth-Scopes: repo, workflow\n"),
    "git --version": ok("git version 2"),
    "git config --get user.name": ok("Octo"),
    "git config --get user.email": ok("o@x.dev"),
  };

  it("passes and returns the owner when everything is set up", async () => {
    route(healthy);
    expect(await checkPrerequisites()).toEqual({ ok: true, problems: [], owner: "octo" });
  });

  it("flags a signed-out gh CLI", async () => {
    route({ ...healthy, "gh auth status": bad("not logged in") });
    const res = await checkPrerequisites();
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/gh auth login/);
  });

  it("flags a missing workflow scope but not a missing scopes header", async () => {
    route({ ...healthy, "gh api -i user": ok("X-Oauth-Scopes: repo\n") });
    expect((await checkPrerequisites()).problems.join(" ")).toMatch(/workflow scope/);
    route({ ...healthy, "gh api -i user": ok("HTTP/2.0 200 OK\n") });
    expect((await checkPrerequisites()).ok).toBe(true);
  });

  it("flags missing git identity", async () => {
    route({ ...healthy, "git config --get user.email": bad("", 1) });
    expect((await checkPrerequisites()).problems.join(" ")).toMatch(/user\.email/);
  });
});

describe("checkName", () => {
  it("accepts a fresh name", async () => {
    route({ "gh repo view": bad("GraphQL: Could not resolve to a Repository") }, { plugin_dir_state: "missing" });
    expect(await checkName("octo", "My Plugin")).toEqual({ kind: "new", id: "my-plugin" });
  });

  it("rejects an existing plain folder", async () => {
    route({}, { plugin_dir_state: "other" });
    expect((await checkName("octo", "My Plugin")).kind).toBe("invalid");
  });

  it("resumes only when the repo is exactly the wizard's README-only output", async () => {
    const repoApi = (fork: string, commits: string, files: string) => ({
      "gh repo view": ok(),
      "gh api repos/octo/stewrd-my-plugin --jq": ok(fork),
      "gh api repos/octo/stewrd-my-plugin/commits": ok(commits),
      "gh api repos/octo/stewrd-my-plugin/contents": ok(files),
    });
    route(repoApi("false", "1", "README.md"), { plugin_dir_state: "missing" });
    expect((await checkName("octo", "My Plugin")).kind).toBe("resume");

    route(repoApi("false", "1", "README.md,plugin.json"), { plugin_dir_state: "missing" });
    expect((await checkName("octo", "My Plugin")).kind).toBe("invalid");

    route(repoApi("true", "1", "README.md"), { plugin_dir_state: "missing" });
    expect((await checkName("octo", "My Plugin")).kind).toBe("invalid");
  });

  it("treats an unexpected gh failure as invalid, not as an available name", async () => {
    route({ "gh repo view": bad("HTTP 500") }, { plugin_dir_state: "missing" });
    expect((await checkName("octo", "My Plugin")).kind).toBe("invalid");
  });
});

describe("STEPS", () => {
  const ctx = { owner: "octo", id: "my-plugin", name: "My Plugin", pluginsDir: "C:\\app\\plugins" };
  const step = (key: string) => STEPS.find((s) => s.key === key)!;

  it("runs the steps in the planned order", () => {
    expect(STEPS.map((s) => s.key)).toEqual(["repo", "clone", "scaffold", "push"]);
  });

  it("skips creating a repo that already exists", async () => {
    route({ "gh repo view": ok() });
    await step("repo").run(ctx);
    const created = invokeMock.mock.calls.some(([, p]) => (p?.args ?? []).includes("create"));
    expect(created).toBe(false);
  });

  it("creates a public repo with a readme when it does not exist", async () => {
    route({ "gh repo view": bad("not found"), "gh repo create": ok() });
    await step("repo").run(ctx);
    const create = invokeMock.mock.calls.find(([, p]) => (p?.args ?? []).includes("create"))![1];
    expect(create.args).toEqual(expect.arrayContaining(["octo/stewrd-my-plugin", "--public", "--add-readme"]));
  });

  it("clones into plugins/<id> and skips when already a git repo", async () => {
    route({ "gh repo clone": ok(), "gh config get": ok("https") }, { plugin_dir_state: "missing" });
    await step("clone").run(ctx);
    const clone = invokeMock.mock.calls.find(([, p]) => (p?.args ?? []).includes("clone"))![1];
    expect(clone.args).toEqual(["repo", "clone", "octo/stewrd-my-plugin", "C:\\app\\plugins\\my-plugin"]);

    invokeMock.mockClear();
    route({}, { plugin_dir_state: "git_repo" });
    await step("clone").run(ctx);
    expect(invokeMock.mock.calls.some(([c]) => c === "run_command_timeout")).toBe(false);
  });

  it("scaffolds through the Rust command", async () => {
    route({});
    await step("scaffold").run(ctx);
    expect(invokeMock).toHaveBeenCalledWith("scaffold_plugin", { dir: "my-plugin", id: "my-plugin", name: "My Plugin" });
  });

  it("skips the commit when nothing is staged but still pushes", async () => {
    route({
      "gh config get": ok("https"),
      "git add": ok(),
      "git status": ok(""),
      "git -c credential.helper=": ok(),
    });
    await step("push").run(ctx);
    const lines = invokeMock.mock.calls.filter(([c]) => c === "run_command_timeout").map(([, p]) => `${p.program} ${p.args.join(" ")}`);
    expect(lines.some((l) => l.includes("commit"))).toBe(false);
    expect(lines.some((l) => l.includes("push -u origin HEAD"))).toBe(true);
  });

  it("commits then pushes with gh's credential helper", async () => {
    route({
      "gh config get": ok("https"),
      "git add": ok(),
      "git status": ok(" M plugin.json"),
      "git -c commit.gpgsign=false commit": ok(),
      "git -c credential.helper=": ok(),
    });
    await step("push").run(ctx);
    const push = invokeMock.mock.calls.map(([, p]) => p).find((p) => p?.args?.includes("push"))!;
    expect(push.args).toContain("credential.helper=!gh auth git-credential");
  });

  it("clears a stale index.lock and explains a timed-out push", async () => {
    route({
      "gh config get": ok("https"),
      "git add": ok(),
      "git status": ok(""),
      "git -c credential.helper=": { code: -1, stdout: "", stderr: "", timedOut: true },
    });
    await expect(step("push").run(ctx)).rejects.toThrow(/timed out.*gh auth setup-git/s);
    expect(invokeMock).toHaveBeenCalledWith("clear_git_index_lock", { dir: "my-plugin" });
  });

  it("points a workflow-scope rejection at gh auth refresh", async () => {
    route({
      "gh config get": ok("https"),
      "git add": ok(),
      "git status": ok(""),
      "git -c credential.helper=": bad("refusing to allow an OAuth App to create or update workflow `.github/workflows/release.yml`"),
    });
    await expect(step("push").run(ctx)).rejects.toThrow(/gh auth refresh -s workflow/);
  });
});
