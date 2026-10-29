import { invoke } from "@tauri-apps/api/core";

// Logic behind Settings > Plugins > Create New Plugin. Every git/gh call goes
// through run_command_timeout (Rust): it kills a hung credential prompt and,
// unlike the event-based spawn path, can't lose a short command's stdout.

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const PUSH_TIMEOUT_MS = 120_000;
const PUSH_COMMIT_MESSAGE = "Initial Hello World plugin";
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const AUTH_ERROR = /terminal prompts disabled|cannot prompt|authentication failed|could not read username|permission denied/i;

export const GH_LOGIN_HINT = "GitHub CLI must be installed and signed in: run `gh auth login`.";

export function run(
  program: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<RunResult> {
  return invoke<RunResult>("run_command_timeout", {
    program,
    args,
    cwd: opts.cwd,
    env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", ...opts.env },
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
}

/** Folder/repo id for a display name: lowercase letters, digits and hyphens. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Returns an error message for a display name that can't become a plugin, or null. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for the plugin.";
  if (trimmed.length > 60) return "Use 60 characters or fewer.";
  if (/["\\]|[\u0000-\u001f]/.test(trimmed)) return "Names can't contain quotes, backslashes or control characters.";
  const id = slugify(trimmed);
  if (!id) return "Use at least one letter or digit.";
  if (RESERVED.test(id)) return `"${id}" is a reserved name on Windows.`;
  return null;
}

export interface Prerequisites {
  ok: boolean;
  problems: string[];
  owner: string;
}

export async function checkPrerequisites(): Promise<Prerequisites> {
  const problems: string[] = [];
  let owner = "";

  const auth = await run("gh", ["auth", "status"]).catch(() => null);
  if (!auth || auth.code !== 0) {
    problems.push(GH_LOGIN_HINT);
  } else {
    const login = await run("gh", ["api", "user", "--jq", ".login"]).catch(() => null);
    owner = login && login.code === 0 ? login.stdout.trim() : "";
    if (!owner) problems.push(GH_LOGIN_HINT);
    // Fine-grained and GH_TOKEN tokens send no scopes header: only block when
    // the header is present and lacks `workflow` (the template ships a workflow file).
    const headers = await run("gh", ["api", "-i", "user"]).catch(() => null);
    const scopes = headers?.stdout.match(/^x-oauth-scopes:\s*(.*)$/im)?.[1];
    if (scopes !== undefined && scopes.trim() !== "" && !/\bworkflow\b/.test(scopes)) {
      problems.push("GitHub CLI needs the workflow scope: run `gh auth refresh -s workflow`.");
    }
  }

  const git = await run("git", ["--version"]).catch(() => null);
  if (!git || git.code !== 0) {
    problems.push("Git must be installed and on your PATH.");
  } else {
    for (const key of ["user.name", "user.email"]) {
      const res = await run("git", ["config", "--get", key]).catch(() => null);
      if (!res || res.code !== 0 || !res.stdout.trim()) {
        problems.push(`Git needs ${key} set: run \`git config --global ${key} "..."\`.`);
      }
    }
  }

  return { ok: problems.length === 0, problems, owner };
}

export type NameCheck =
  | { kind: "new"; id: string }
  | { kind: "resume"; id: string }
  | { kind: "invalid"; message: string };

export async function checkName(owner: string, name: string): Promise<NameCheck> {
  const invalid = validateName(name);
  if (invalid) return { kind: "invalid", message: invalid };
  const id = slugify(name);
  const repo = `${owner}/stewrd-${id}`;

  let folder: string;
  try {
    folder = await invoke<string>("plugin_dir_state", { dir: id });
  } catch (e) {
    return { kind: "invalid", message: String(e) };
  }
  if (folder === "other") {
    return { kind: "invalid", message: `A folder named "${id}" already exists in the plugins folder. Pick another name or remove it.` };
  }

  const view = await run("gh", ["repo", "view", repo]).catch(() => null);
  if (!view) return { kind: "invalid", message: "Couldn't reach GitHub. Check your connection and try again." };
  if (view.code !== 0) {
    if (/could not resolve to a repository|not found|404/i.test(view.stderr)) {
      return folder === "missing" || folder === "empty"
        ? { kind: "new", id }
        : { kind: "invalid", message: `The folder "${id}" already has a git repository. Pick another name or remove it.` };
    }
    return { kind: "invalid", message: `Couldn't check GitHub for ${repo}: ${view.stderr.trim() || "unknown error"}` };
  }

  // The repo exists. Resume only when it is exactly this wizard's earlier
  // `--add-readme` output, so a real published plugin is never overwritten.
  const q = async (path: string, jq: string) => {
    const res = await run("gh", ["api", path, "--jq", jq]).catch(() => null);
    return res && res.code === 0 ? res.stdout.trim() : null;
  };
  const isFork = await q(`repos/${repo}`, ".fork");
  const commits = await q(`repos/${repo}/commits?per_page=2`, "length");
  const files = await q(`repos/${repo}/contents`, "[.[].name] | join(\",\")");
  if (isFork === "false" && commits === "1" && files === "README.md") return { kind: "resume", id };
  return { kind: "invalid", message: `${repo} already exists. Pick another name.` };
}

export interface StepContext {
  owner: string;
  id: string;
  name: string;
  pluginsDir: string;
}

export interface Step {
  key: "repo" | "clone" | "scaffold" | "push";
  label: string;
  run: (ctx: StepContext) => Promise<void>;
}

function fail(res: RunResult | null, what: string): never {
  if (!res) throw new Error(`${what}: could not run the command.`);
  if (res.timedOut) throw new Error(`${what} timed out. If this keeps happening, run \`gh auth setup-git\` and try again.`);
  const detail = (res.stderr || res.stdout).trim();
  if (AUTH_ERROR.test(detail)) throw new Error(`${what} was rejected by GitHub (${detail}). Run \`gh auth setup-git\` and try again.`);
  throw new Error(`${what} failed: ${detail || `exit code ${res.code}`}`);
}

function joinPath(dir: string, leaf: string): string {
  return dir + (dir.includes("\\") ? "\\" : "/") + leaf;
}

async function gitEnv(): Promise<Record<string, string>> {
  // BatchMode keeps an SSH passphrase/host-key prompt from hanging a step, but
  // only touch the user's SSH setup when it is plain default OpenSSH over ssh.
  const protocol = await run("gh", ["config", "get", "git_protocol"]).catch(() => null);
  if (protocol?.stdout.trim() !== "ssh") return {};
  const custom = await run("git", ["config", "--get", "core.sshCommand"]).catch(() => null);
  if (custom && custom.stdout.trim()) return {};
  return { GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };
}

export const STEPS: Step[] = [
  {
    key: "repo",
    label: "Create The GitHub Repository",
    run: async (ctx) => {
      const repo = `${ctx.owner}/stewrd-${ctx.id}`;
      const view = await run("gh", ["repo", "view", repo]).catch(() => null);
      if (view && view.code === 0) return; // already created (resume or retry)
      const res = await run("gh", [
        "repo", "create", repo, "--public", "--add-readme",
        "--description", `${ctx.name} - a Stewrd plugin`,
      ]).catch(() => null);
      if (!res || res.code !== 0 || res.timedOut) fail(res, "Creating the repository");
    },
  },
  {
    key: "clone",
    label: "Clone Into The Plugins Folder",
    run: async (ctx) => {
      const state = await invoke<string>("plugin_dir_state", { dir: ctx.id });
      if (state === "git_repo") return; // already cloned (retry)
      if (state === "other") throw new Error(`The folder "${ctx.id}" already exists and isn't a clone. Remove it and retry.`);
      const res = await run("gh", ["repo", "clone", `${ctx.owner}/stewrd-${ctx.id}`, joinPath(ctx.pluginsDir, ctx.id)], {
        env: await gitEnv(),
      }).catch(() => null);
      if (!res || res.code !== 0 || res.timedOut) fail(res, "Cloning the repository");
    },
  },
  {
    key: "scaffold",
    label: "Create The Hello World Plugin",
    run: async (ctx) => {
      await invoke("scaffold_plugin", { dir: ctx.id, id: ctx.id, name: ctx.name.trim() });
    },
  },
  {
    key: "push",
    label: "Commit And Push To GitHub",
    run: async (ctx) => {
      const cwd = joinPath(ctx.pluginsDir, ctx.id);
      const env = await gitEnv();
      // A previous attempt killed by the timeout leaves a stale lock behind.
      await invoke("clear_git_index_lock", { dir: ctx.id });

      const add = await run("git", ["add", "-A"], { cwd, env }).catch(() => null);
      if (!add || add.code !== 0 || add.timedOut) {
        if (add?.timedOut) await invoke("clear_git_index_lock", { dir: ctx.id });
        fail(add, "Staging the files");
      }

      const status = await run("git", ["status", "--porcelain"], { cwd, env }).catch(() => null);
      if (!status || status.code !== 0) fail(status, "Checking the repository status");
      if (status.stdout.trim()) {
        const commit = await run("git", ["-c", "commit.gpgsign=false", "commit", "-m", PUSH_COMMIT_MESSAGE], { cwd, env }).catch(() => null);
        if (!commit || commit.code !== 0 || commit.timedOut) {
          if (commit?.timedOut) await invoke("clear_git_index_lock", { dir: ctx.id });
          fail(commit, "Committing");
        }
      }

      // gh's own credential helper, so the workflow-scope check above and the
      // push use the same token.
      const push = await run(
        "git",
        ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "-u", "origin", "HEAD"],
        { cwd, env, timeoutMs: PUSH_TIMEOUT_MS },
      ).catch(() => null);
      if (!push || push.code !== 0 || push.timedOut) {
        if (push && /refusing to allow an oauth app to create or update workflow/i.test(push.stderr)) {
          throw new Error("GitHub rejected the workflow file. Run `gh auth refresh -s workflow` and retry.");
        }
        fail(push, "Pushing to GitHub");
      }
    },
  },
];
