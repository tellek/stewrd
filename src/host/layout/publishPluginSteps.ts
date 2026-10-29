import { invoke } from "@tauri-apps/api/core";
import { run, GH_LOGIN_HINT, type RunResult } from "./createPluginSteps";

// Logic behind Settings > Plugins > Publish. Publishing to the marketplace is
// a pull request against tellek/stewrd that appends one entry to
// docs/plugin-catalog.json (see docs/plugin-catalog.README.md); everything goes
// through the GitHub API with `gh`, so the host repo is never cloned.

export const HOST_REPO = "tellek/stewrd";
const CATALOG_PATH = "docs/plugin-catalog.json";
const FORK_POLL_ATTEMPTS = 10;
const FORK_POLL_DELAY_MS = 2000;

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  repo: string;
  apiVersion: string;
  category: string;
}

export interface PublishPreflight {
  ok: boolean;
  problems: string[];
  owner: string;
  entry: CatalogEntry | null;
}

export interface PublishPlugin {
  dir: string;
  id: string;
  name: string;
  description: string;
  apiVersion: string;
  category: string;
}

/** `owner/repo` from an https or ssh GitHub remote URL, or null. */
export function parseGithubRemote(url: string): string | null {
  const m = url.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

async function gh(args: string[]): Promise<RunResult | null> {
  return run("gh", args).catch(() => null);
}

export async function preflight(plugin: PublishPlugin, pluginsDir: string, catalogIds: Set<string>): Promise<PublishPreflight> {
  const problems: string[] = [];
  const fail = (owner = ""): PublishPreflight => ({ ok: false, problems, owner, entry: null });

  const login = await gh(["api", "user", "--jq", ".login"]);
  const owner = login && login.code === 0 ? login.stdout.trim() : "";
  if (!owner) {
    problems.push(GH_LOGIN_HINT);
    return fail();
  }

  if (plugin.apiVersion !== "1") problems.push(`apiVersion is "${plugin.apiVersion}"; the marketplace needs "1".`);
  if (catalogIds.has(plugin.id)) problems.push(`"${plugin.id}" is already in the marketplace catalog.`);
  if (!plugin.category) problems.push('Set a "category" in the plugin\'s settings.json (Configure).');

  const sep = pluginsDir.includes("\\") ? "\\" : "/";
  const origin = await run("git", ["-C", pluginsDir + sep + plugin.dir, "remote", "get-url", "origin"]).catch(() => null);
  const repo = origin && origin.code === 0 ? parseGithubRemote(origin.stdout) : null;
  if (!repo) {
    problems.push("This plugin isn't a git clone of a GitHub repository. Push it to GitHub first.");
    return fail(owner);
  }

  const priv = await gh(["api", `repos/${repo}`, "--jq", ".private"]);
  if (!priv || priv.code !== 0) problems.push(`Couldn't read ${repo} on GitHub.`);
  else if (priv.stdout.trim() !== "false") problems.push(`${repo} must be public.`);

  const zips = await gh(["api", `repos/${repo}/releases/latest`, "--jq", '[.assets[].name | select(endswith(".zip"))] | length']);
  if (!zips || zips.code !== 0) problems.push(`${repo} has no release yet. Push a v<version> tag so a release with a zip is created.`);
  else if (Number(zips.stdout.trim()) < 1) problems.push(`The latest ${repo} release has no .zip asset, so Install would stay disabled.`);

  if (problems.length) return fail(owner);
  return {
    ok: true,
    problems: [],
    owner,
    entry: { id: plugin.id, name: plugin.name, description: plugin.description, repo, apiVersion: plugin.apiVersion, category: plugin.category },
  };
}

export interface PublishContext {
  owner: string;
  entry: CatalogEntry;
  /** Filled in by the "branch" step for the later ones. */
  headRepo?: string;
  branch?: string;
  prUrl?: string;
}

export interface PublishStep {
  key: "branch" | "catalog" | "pr";
  label: string;
  run: (ctx: PublishContext) => Promise<void>;
}

function must(res: RunResult | null, what: string): RunResult {
  if (!res) throw new Error(`${what}: could not run gh.`);
  if (res.timedOut) throw new Error(`${what} timed out.`);
  if (res.code !== 0) throw new Error(`${what} failed: ${(res.stderr || res.stdout).trim() || `exit code ${res.code}`}`);
  return res;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
export function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ""))));
}

/** Appends `entry` to a catalog file's text, keeping the 2-space indent and trailing newline. */
export function appendCatalogEntry(text: string, entry: CatalogEntry): string | null {
  const list = JSON.parse(text) as CatalogEntry[];
  if (list.some((e) => e.id === entry.id)) return null;
  return JSON.stringify([...list, entry], null, 2) + "\n";
}

export const PUBLISH_STEPS: PublishStep[] = [
  {
    key: "branch",
    label: "Create A Branch",
    run: async (ctx) => {
      ctx.branch = `add-plugin-${ctx.entry.id}`;
      if (ctx.owner.toLowerCase() === "tellek") {
        // The owner of the host repo branches on it directly (can't fork your own repo).
        ctx.headRepo = HOST_REPO;
      } else {
        // GitHub renames a fork when the user already has a different `stewrd`
        // repo, so find the fork's real name instead of assuming it.
        await gh(["repo", "fork", HOST_REPO, "--clone=false"]);
        let found = "";
        for (let i = 0; i < FORK_POLL_ATTEMPTS && !found; i++) {
          const forks = await gh(["api", `repos/${HOST_REPO}/forks?per_page=100`, "--paginate", "--jq", `.[] | select(.owner.login == "${ctx.owner}") | .full_name`]);
          found = forks && forks.code === 0 ? forks.stdout.trim().split("\n")[0] : "";
          if (!found) await sleep(FORK_POLL_DELAY_MS);
        }
        if (!found) throw new Error("Your fork of tellek/stewrd didn't appear on GitHub in time. Retry in a moment.");
        for (let i = 0; i < FORK_POLL_ATTEMPTS; i++) {
          const ready = await gh(["api", `repos/${found}/git/ref/heads/main`, "--jq", ".object.sha"]);
          if (ready && ready.code === 0) break;
          await sleep(FORK_POLL_DELAY_MS);
        }
        ctx.headRepo = found;
      }
      // Branch from upstream main so a stale fork never reverts newer catalog entries.
      const base = must(await gh(["api", `repos/${HOST_REPO}/git/ref/heads/main`, "--jq", ".object.sha"]), "Reading upstream main");
      const created = await gh(["api", "-X", "POST", `repos/${ctx.headRepo}/git/refs`, "-f", `ref=refs/heads/${ctx.branch}`, "-f", `sha=${base.stdout.trim()}`]);
      if (created && created.code !== 0 && !/reference already exists/i.test(created.stderr)) must(created, "Creating the branch");
    },
  },
  {
    key: "catalog",
    label: "Add The Catalog Entry",
    run: async (ctx) => {
      const path = `repos/${ctx.headRepo}/contents/${CATALOG_PATH}`;
      const file = must(await gh(["api", `${path}?ref=${ctx.branch}`, "--jq", ".sha + \" \" + .content"]), "Reading the catalog");
      const [sha, ...rest] = file.stdout.trim().split(" ");
      const updated = appendCatalogEntry(fromBase64(rest.join("")), ctx.entry);
      if (updated === null) return; // already added (retry)
      must(
        await gh(["api", "-X", "PUT", path, "-f", `message=Add ${ctx.entry.name} to the marketplace catalog`, "-f", `content=${toBase64(updated)}`, "-f", `sha=${sha}`, "-f", `branch=${ctx.branch}`]),
        "Updating the catalog",
      );
    },
  },
  {
    key: "pr",
    label: "Open The Pull Request",
    run: async (ctx) => {
      const head = `${ctx.owner}:${ctx.branch}`;
      const existing = await gh(["pr", "list", "--repo", HOST_REPO, "--head", head, "--json", "url", "--jq", ".[0].url"]);
      if (existing && existing.code === 0 && existing.stdout.trim()) {
        ctx.prUrl = existing.stdout.trim();
        return;
      }
      const body = `Adds **${ctx.entry.name}** (\`${ctx.entry.id}\`) from https://github.com/${ctx.entry.repo} to \`${CATALOG_PATH}\`.\n\nCreated from Stewrd's Settings > Plugins > Publish.`;
      const res = must(
        await gh(["pr", "create", "--repo", HOST_REPO, "--base", "main", "--head", head, "--title", `Add ${ctx.entry.name} to the marketplace`, "--body", body]),
        "Opening the pull request",
      );
      ctx.prUrl = res.stdout.trim().split("\n").pop() ?? "";
    },
  },
];

export async function getPluginsDir(): Promise<string> {
  return invoke<string>("get_plugins_dir");
}
