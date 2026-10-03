/// <reference path="../.stewrd/plugin-api.d.ts" />
// Browses a community plugin catalog (hosted JSON, fetched live so new
// approved plugins/updates show up without a stewrd release) and installs or
// updates entries via the host's install_plugin_from_url command. See
// docs/plan-phases/03-marketplace-plugin.md and the master plan it links for
// the full design rationale - this file follows it closely.
import { useEffect, useState, type ReactNode } from "react";
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
  /** Zip downloads summed across every release, since each release's own count starts at zero. */
  totalDownloads?: number;
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

// Per-repo release metadata cache, in-memory only (module scope) - the fs
// watcher now ignores a plugin's own storage.json (see watcher.rs), so this
// is no longer required to dodge a hot-reload loop, but it still avoids
// re-spending the 60/hour unauthenticated GitHub API budget on every row
// re-expand.
const releaseCache = new Map<string, ReleaseState>();

const SUCCESS_DISPLAY_MS = 5000;

export interface StatusInputs {
  busy: boolean;
  error: boolean;
  updateAvailable: boolean;
  success: boolean;
}

export type MarketplaceStatus = "idle" | "in-progress" | "success" | "warning" | "error";

/** Sidebar icon status: installing/updating > failed > update available > recent success > idle. */
export function computeStatus({ busy, error, updateAvailable, success }: StatusInputs): MarketplaceStatus {
  if (busy) return "in-progress";
  if (error) return "error";
  if (updateAvailable) return "warning";
  if (success) return "success";
  return "idle";
}

/** True only when the installed version is known and the release is confirmed not newer. */
export function isUpToDate(installedVersion: string | undefined, releaseTag: string | undefined): boolean {
  if (!installedVersion || !releaseTag) return false;
  const cmp = compareSemver(releaseTag, installedVersion);
  return cmp !== null && cmp <= 0;
}

// Icon status lives at module scope (not in Component state) so it stays
// correct while the marketplace pane isn't mounted, e.g. an install still
// running after the user switches tools.
const work = { busy: 0, error: false, updateAvailable: false, successPending: false, successShowing: false };
let applyStatus: ((status: MarketplaceStatus) => void) | null = null;
let successTimer: ReturnType<typeof setTimeout> | null = null;

function refreshStatus() {
  applyStatus?.(
    computeStatus({
      busy: work.busy > 0,
      error: work.error,
      updateAvailable: work.updateAvailable,
      success: work.successShowing,
    }),
  );
}

function beginWork() {
  work.busy++;
  work.error = false;
  work.successPending = false;
  work.successShowing = false;
  refreshStatus();
}

function finishWork(ok: boolean) {
  work.busy--;
  work.error = !ok;
  work.successPending = ok;
  refreshStatus();
  if (ok && document.hasFocus()) startSuccessTimer();
}

// The 5s success display starts once the window has focus, so it's seen even
// if the install finished while the user was elsewhere.
function startSuccessTimer() {
  if (!work.successPending) return;
  work.successPending = false;
  work.successShowing = true;
  refreshStatus();
  successTimer = setTimeout(() => {
    work.successShowing = false;
    refreshStatus();
  }, SUCCESS_DISPLAY_MS);
}

async function checkForUpdates(api: PluginApi) {
  try {
    const [{ entries }, installed] = await Promise.all([loadCatalog(api), loadInstalled()]);
    const releases = await Promise.all(entries.map((e) => fetchLatestRelease(e.repo)));
    work.updateAvailable = entries.some((entry, i) => {
      const existing = findInstalledEntry(installed, entry);
      const tag = releases[i].release?.tag_name;
      return (
        !!existing && !existing.broken && !!existing.version && !!tag && compareSemver(tag, existing.version) === 1
      );
    });
    refreshStatus();
  } catch {
    // Offline or no catalog: leave the status as is.
  }
}

export function activate(ctx: PluginContext) {
  ctx.api.log.info("marketplace plugin activated");
  applyStatus = (status) => {
    if (!ctx.signal.aborted) ctx.api.statusIcon.set(status);
  };
  refreshStatus();
  const onFocus = () => startSuccessTimer();
  window.addEventListener("focus", onFocus);
  ctx.onDispose(() => {
    window.removeEventListener("focus", onFocus);
    if (successTimer) clearTimeout(successTimer);
    applyStatus = null;
  });
  void checkForUpdates(ctx.api);
}

export function deactivate() {}

export async function loadCatalog(api: PluginApi): Promise<{ entries: CatalogEntry[]; stale: boolean }> {
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
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`);
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
      const releases: (GhRelease & { draft?: boolean; prerelease?: boolean })[] = await resp.json();
      const release = releases.find((r) => !r.draft && !r.prerelease) ?? null;
      const totalDownloads = releases.reduce((sum, r) => sum + (findZipAsset(r)?.download_count ?? 0), 0);
      state = { release, totalDownloads, fetchedAt: Date.now() };
    }
  } catch {
    state = { release: null, fetchedAt: Date.now(), error: "offline" };
  }
  releaseCache.set(repo, state);
  return state;
}

export function findZipAsset(release: GhRelease): GhAsset | undefined {
  return release.assets.find((a) => a.name.toLowerCase().endsWith(".zip"));
}

export function parseSemver(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `1` if `a` is newer than `b`, `0` if equal, `-1` if older, `null` if either fails to parse. */
export function compareSemver(a: string, b: string): number | null {
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

function findInstalledEntry(installed: Map<string, InstalledEntry>, entry: CatalogEntry): InstalledEntry | undefined {
  for (const inst of installed.values()) {
    if (inst.id === entry.id) return inst;
    if (inst.broken && inst.dir === entry.id) return inst;
  }
  return undefined;
}

export function Component({ api }: { api: PluginApi }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogStale, setCatalogStale] = useState(false);
  const [search, setSearch] = useState("");
  const [releaseByRepo, setReleaseByRepo] = useState<Map<string, ReleaseState>>(new Map());
  const [installed, setInstalled] = useState<Map<string, InstalledEntry>>(new Map());
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const palette = api.theme.palette;

  useEffect(() => {
    loadCatalog(api)
      .then(({ entries, stale }) => {
        setEntries(entries);
        setCatalogStale(stale);
      })
      .catch((e: Error) => setCatalogError(e.message));
    loadInstalled().then(setInstalled);
  }, [api]);

  useEffect(() => {
    if (!entries) return;
    let active = true;
    entries.forEach((entry) => {
      fetchLatestRelease(entry.repo).then((state) => {
        if (active) setReleaseByRepo((prev) => new Map(prev).set(entry.repo, state));
      });
    });
    return () => {
      active = false;
    };
  }, [entries]);

  function findInstalled(entry: CatalogEntry): InstalledEntry | undefined {
    return findInstalledEntry(installed, entry);
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
    beginWork();
    let ok = false;
    try {
      await invoke<string>("install_plugin_from_url", {
        url: asset.browser_download_url,
        fileName: asset.name,
        mode,
        expectedDir: existing?.dir,
      });
      api.toast.show({ message: `${entry.name} ${mode === "update" ? "updated" : "installed"}.`, kind: "success" });
      ok = true;
      const nowInstalled = await loadInstalled();
      setInstalled(nowInstalled);
      void checkForUpdates(api);
    } catch (e) {
      if (!ok) api.toast.show({ message: `${entry.name}: ${String(e)}`, kind: "error" });
    } finally {
      finishWork(ok);
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
      <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${palette.border}` }}>
            <th style={{ textAlign: "left", padding: 6, color: palette.textMuted }}>Name</th>
            <th style={{ textAlign: "left", padding: 6, color: palette.textMuted }}>Description</th>
            <th style={{ textAlign: "left", padding: 6, color: palette.textMuted }}>Version</th>
            <th style={{ textAlign: "right", padding: 6, color: palette.textMuted }}>Installs</th>
            <th style={{ textAlign: "left", padding: 6, color: palette.textMuted }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry) => {
            const existing = findInstalled(entry);
            const state = releaseByRepo.get(entry.repo);
            const asset = state?.release ? findZipAsset(state.release) : undefined;
            const updateAvailable =
              existing && existing.version && !existing.broken && state?.release
                ? compareSemver(state.release.tag_name, existing.version!) === 1
                : false;
            const upToDate = !!existing && !existing.broken && isUpToDate(existing.version, state?.release?.tag_name);
            const label = existing?.broken ? "Repair" : existing ? "Update" : "Install";
            const busy = busyRepo === entry.repo;

            let versionCell: ReactNode = <api.ui.Spinner />;
            if (state) {
              if (state.error === "rate-limited") {
                versionCell = <span style={{ color: palette.status.warning }}>Rate limited</span>;
              } else if (state.error === "offline" || !state.release) {
                versionCell = <span style={{ color: palette.status.error }}>Offline</span>;
              } else {
                versionCell = <span>{state.release.tag_name}</span>;
              }
            }

            return (
              <tr key={entry.id} style={{ borderBottom: `1px solid ${palette.border}` }}>
                <td style={{ padding: 6, color: palette.text }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {entry.name}
                    {existing?.broken && <api.ui.StatusDot color="error" />}
                    {updateAvailable && <api.ui.StatusDot color="warning" />}
                  </div>
                  {entry.apiVersion !== SUPPORTED_API_VERSION && (
                    <api.ui.Banner
                      message={`Declares apiVersion ${entry.apiVersion}, host supports ${SUPPORTED_API_VERSION}.`}
                      tone="warning"
                    />
                  )}
                </td>
                <td style={{ padding: 6, color: palette.textMuted, maxWidth: 320, whiteSpace: "normal" }}>
                  {entry.description}
                </td>
                <td style={{ padding: 6 }}>{versionCell}</td>
                <td style={{ padding: 6, color: palette.textMuted, textAlign: "right" }}>
                  {state?.totalDownloads ?? "—"}
                </td>
                <td style={{ padding: 6 }}>
                  <api.ui.IconTextButton
                    label={busy ? "Working..." : label}
                    onClick={() => state?.release && installOrUpdate(entry, state.release, existing)}
                    disabled={busy || !asset || upToDate}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
