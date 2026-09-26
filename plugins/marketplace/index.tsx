/// <reference path="../.stewrd/plugin-api.d.ts" />
// Browses a community plugin catalog (hosted JSON, fetched live so new
// approved plugins/updates show up without a stewrd release) and installs or
// updates entries via the host's install_plugin_from_url command. See
// docs/plan-phases/03-marketplace-plugin.md and the master plan it links for
// the full design rationale - this file follows it closely.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";

const CATALOG_URL = "https://raw.githubusercontent.com/tellek/stewrd/main/docs/plugin-catalog.json";
const SUPPORTED_API_VERSION = "1"; // kept in sync manually - this plugin ships with the host and is rebuilt alongside it.
const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  repo: string;
  apiVersion: string;
  category: string;
}

interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
  download_count: number;
}

interface GhRelease {
  tag_name: string;
  assets: GhAsset[];
}

interface ReleaseState {
  release: GhRelease | null;
  fetchedAt: number;
  error?: "offline" | "rate-limited";
  rateLimitResetAt?: number;
}

interface InstalledEntry {
  dir: string;
  id?: string;
  version?: string;
  broken: boolean;
}

// Per-repo release metadata cache, in-memory only (module scope) - avoids
// api.storage entirely (writing storage.json would fire plugin-changed and
// hot-reload this plugin mid-browse) and avoids re-spending the 60/hour
// unauthenticated GitHub API budget on every row re-expand.
const releaseCache = new Map<string, ReleaseState>();

export function activate(ctx: PluginContext) {
  ctx.api.log.info("marketplace plugin activated");
  ctx.api.statusIcon.set("idle");
}

export function deactivate() {}

async function loadCatalog(api: PluginApi): Promise<{ entries: CatalogEntry[]; stale: boolean }> {
  try {
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) throw new Error(`catalog fetch returned ${resp.status}`);
    const entries: CatalogEntry[] = await resp.json();
    await api.fs.writeTextFile("data/catalog-cache.json", JSON.stringify(entries)).catch(() => {});
    return { entries, stale: false };
  } catch {
    const cached = await api.fs.readTextFile("data/catalog-cache.json").catch(() => null);
    if (cached) {
      try {
        return { entries: JSON.parse(cached), stale: true };
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("could not reach the plugin catalog and no cached copy is available");
  }
}

async function fetchLatestRelease(repo: string): Promise<ReleaseState> {
  const cached = releaseCache.get(repo);
  if (cached && Date.now() - cached.fetchedAt < RELEASE_CACHE_TTL_MS) {
    return cached;
  }
  let state: ReleaseState;
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (resp.status === 403 && resp.headers.get("X-RateLimit-Remaining") === "0") {
      const resetHeader = resp.headers.get("X-RateLimit-Reset");
      state = {
        release: null,
        fetchedAt: Date.now(),
        error: "rate-limited",
        rateLimitResetAt: resetHeader ? Number(resetHeader) * 1000 : undefined,
      };
    } else if (!resp.ok) {
      state = { release: null, fetchedAt: Date.now(), error: "offline" };
    } else {
      const release: GhRelease = await resp.json();
      state = { release, fetchedAt: Date.now() };
    }
  } catch {
    state = { release: null, fetchedAt: Date.now(), error: "offline" };
  }
  releaseCache.set(repo, state);
  return state;
}

function findZipAsset(release: GhRelease): GhAsset | undefined {
  return release.assets.find((a) => a.name.toLowerCase().endsWith(".zip"));
}

function parseSemver(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `1` if `a` is newer than `b`, `0` if equal, `-1` if older, `null` if either fails to parse. */
function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

async function loadInstalled(): Promise<Map<string, InstalledEntry>> {
  const byDir = new Map<string, InstalledEntry>();
  try {
    const entries = await invoke<unknown[]>("list_plugins");
    for (const raw of entries) {
      const entry = raw as { kind?: string; dir: string; manifest?: { id: string }; version?: string };
      if (entry.kind === "error") {
        byDir.set(entry.dir, { dir: entry.dir, broken: true });
      } else {
        byDir.set(entry.dir, { dir: entry.dir, id: entry.manifest?.id, version: entry.version, broken: false });
      }
    }
  } catch {
    // list_plugins failing is unexpected but shouldn't block browsing the catalog.
  }
  return byDir;
}

export function Component({ api }: { api: PluginApi }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogStale, setCatalogStale] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [releaseByRepo, setReleaseByRepo] = useState<Map<string, ReleaseState>>(new Map());
  const [installed, setInstalled] = useState<Map<string, InstalledEntry>>(new Map());
  const [busyRepo, setBusyRepo] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog(api)
      .then(({ entries, stale }) => {
        setEntries(entries);
        setCatalogStale(stale);
      })
      .catch((e: Error) => setCatalogError(e.message));
    loadInstalled().then(setInstalled);
  }, [api]);

  async function expandRow(entry: CatalogEntry) {
    if (expanded === entry.repo) {
      setExpanded(null);
      return;
    }
    setExpanded(entry.repo);
    const state = await fetchLatestRelease(entry.repo);
    setReleaseByRepo((prev) => new Map(prev).set(entry.repo, state));
  }

  function findInstalled(entry: CatalogEntry): InstalledEntry | undefined {
    for (const inst of installed.values()) {
      if (inst.id === entry.id) return inst;
      if (inst.broken && inst.dir === entry.id) return inst;
    }
    return undefined;
  }

  async function installOrUpdate(entry: CatalogEntry, release: GhRelease, existing: InstalledEntry | undefined) {
    const asset = findZipAsset(release);
    if (!asset) {
      api.toast.show({ message: `${entry.name}: latest release has no .zip asset`, kind: "error" });
      return;
    }
    const mode = existing ? "update" : "install";
    const confirmed = await api.modal.confirm({
      title: `${mode === "update" ? "Update" : "Install"} ${entry.name}?`,
      message: `This installs ${entry.repo}'s release ${release.tag_name}. Plugins run with full system access, the same trust level as any other installed plugin - only proceed if you trust this repo's author.`,
      confirmLabel: mode === "update" ? "Update" : "Install",
    });
    if (!confirmed) return;

    setBusyRepo(entry.repo);
    try {
      await invoke<string>("install_plugin_from_url", {
        url: asset.browser_download_url,
        fileName: asset.name,
        mode,
        expectedDir: existing?.dir,
      });
      api.toast.show({ message: `${entry.name} ${mode === "update" ? "updated" : "installed"}.`, kind: "success" });
      setInstalled(await loadInstalled());
    } catch (e) {
      api.toast.show({ message: `${entry.name}: ${String(e)}`, kind: "error" });
    } finally {
      setBusyRepo(null);
    }
  }

  if (catalogError) {
    return (
      <div>
        <h2>Marketplace</h2>
        <api.ui.Banner message={catalogError} tone="error" />
      </div>
    );
  }

  if (!entries) {
    return (
      <div>
        <h2>Marketplace</h2>
        <api.ui.Spinner />
      </div>
    );
  }

  const filtered = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2>Marketplace</h2>
      {catalogStale && <api.ui.Banner message="Showing a cached catalog - could not reach the network." tone="warning" />}
      <api.ui.TextBox value={search} onChange={setSearch} placeholder="Search plugins..." rows={1} />
      <div style={{ marginTop: 12 }}>
        {filtered.map((entry) => {
          const existing = findInstalled(entry);
          const apiVersionMismatch = entry.apiVersion !== SUPPORTED_API_VERSION;
          const updateAvailable =
            existing && existing.version && !existing.broken
              ? (() => {
                  const state = releaseByRepo.get(entry.repo);
                  if (!state?.release) return false;
                  const cmp = compareSemver(state.release.tag_name, existing.version!);
                  return cmp === 1;
                })()
              : false;

          return (
            <div key={entry.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <api.ui.Link label={entry.name} onClick={() => expandRow(entry)} />
                <span>{entry.description}</span>
                {existing?.broken && <api.ui.StatusDot color="error" />}
                {updateAvailable && <api.ui.StatusDot color="warning" />}
              </div>

              {expanded === entry.repo && (
                <div style={{ marginTop: 4, marginLeft: 12 }}>
                  {apiVersionMismatch && (
                    <api.ui.Banner
                      message={`This plugin declares apiVersion ${entry.apiVersion}, host supports ${SUPPORTED_API_VERSION}.`}
                      tone="warning"
                    />
                  )}
                  <ReleasePanel
                    api={api}
                    entry={entry}
                    existing={existing}
                    busy={busyRepo === entry.repo}
                    onInstall={(release) => installOrUpdate(entry, release, existing)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReleasePanel({
  api,
  entry,
  existing,
  busy,
  onInstall,
}: {
  api: PluginApi;
  entry: CatalogEntry;
  existing: InstalledEntry | undefined;
  busy: boolean;
  onInstall: (release: GhRelease) => void;
}) {
  const [state, setState] = useState<ReleaseState | null>(releaseCache.get(entry.repo) ?? null);

  useEffect(() => {
    let active = true;
    fetchLatestRelease(entry.repo).then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, [entry.repo]);

  if (!state) return <api.ui.Spinner />;

  if (state.error === "rate-limited") {
    const resetText = state.rateLimitResetAt ? new Date(state.rateLimitResetAt).toLocaleTimeString() : "later";
    return <api.ui.Banner message={`GitHub API rate limit hit - try again after ${resetText}.`} tone="warning" />;
  }
  if (state.error === "offline" || !state.release) {
    return <api.ui.Banner message="Could not reach GitHub for this plugin's release info." tone="error" />;
  }

  const asset = findZipAsset(state.release);
  const label = existing?.broken ? "Repair" : existing ? "Update" : "Install";

  return (
    <div>
      <p>
        Latest: {state.release.tag_name}
        {asset ? ` — ${asset.download_count} downloads` : " — no .zip asset found"}
      </p>
      <api.ui.IconTextButton
        label={busy ? "Working..." : label}
        onClick={() => state.release && onInstall(state.release)}
        disabled={busy || !asset}
      />
    </div>
  );
}
