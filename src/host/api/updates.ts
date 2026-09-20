import { invoke } from "@tauri-apps/api/core";

export interface ReleaseInfo {
  tag: string;
  name: string;
  body: string;
  publishedAt: string | null;
  url: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { releases: ReleaseInfo[]; fetchedAt: number } | null = null;

// Settings tabs unmount when the user switches away (see SettingsPage.tsx),
// so a naive mount-time fetch would re-hit GitHub's 60-req/hour
// unauthenticated limit every time this tab is revisited. A short-lived
// module-level cache avoids that without needing a global store slice.
export async function listReleases(): Promise<ReleaseInfo[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.releases;
  }
  const releases = await invoke<ReleaseInfo[]>("list_releases");
  cache = { releases, fetchedAt: Date.now() };
  return releases;
}
