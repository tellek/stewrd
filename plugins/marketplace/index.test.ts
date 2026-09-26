import { describe, expect, it, vi, beforeEach } from "vitest";
import { compareSemver, parseSemver, findZipAsset, loadCatalog } from "./index";

describe("parseSemver / compareSemver", () => {
  it("parses a plain semver string", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  it("strips a leading v", () => {
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("returns null for an unparseable version", () => {
    expect(parseSemver("not-a-version")).toBeNull();
  });

  it("detects a newer version", () => {
    expect(compareSemver("v1.1.0", "1.0.0")).toBe(1);
  });

  it("detects an older version", () => {
    expect(compareSemver("1.0.0", "v1.1.0")).toBe(-1);
  });

  it("detects equal versions", () => {
    expect(compareSemver("1.0.0", "v1.0.0")).toBe(0);
  });

  it("never claims an update when either side fails to parse", () => {
    expect(compareSemver("latest", "1.0.0")).toBeNull();
    expect(compareSemver("1.0.0", "latest")).toBeNull();
  });
});

describe("findZipAsset", () => {
  it("finds the first .zip asset case-insensitively", () => {
    const release = {
      tag_name: "v1.0.0",
      assets: [
        { name: "readme.txt", size: 1, browser_download_url: "a", download_count: 0 },
        { name: "release.ZIP", size: 2, browser_download_url: "b", download_count: 5 },
      ],
    };
    expect(findZipAsset(release)?.name).toBe("release.ZIP");
  });

  it("returns undefined when no .zip asset exists", () => {
    const release = { tag_name: "v1.0.0", assets: [{ name: "readme.txt", size: 1, browser_download_url: "a", download_count: 0 }] };
    expect(findZipAsset(release)).toBeUndefined();
  });
});

describe("loadCatalog", () => {
  const fakeApi = {
    fs: {
      writeTextFile: vi.fn().mockResolvedValue(undefined),
      readTextFile: vi.fn(),
    },
  } as unknown as import("stewrd-plugin-api").PluginApi;

  beforeEach(() => {
    vi.mocked(fakeApi.fs.writeTextFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(fakeApi.fs.readTextFile).mockReset();
  });

  it("returns fresh entries and caches them on a successful fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "x" }] }) as never;
    const result = await loadCatalog(fakeApi);
    expect(result.stale).toBe(false);
    expect(result.entries).toEqual([{ id: "x" }]);
    expect(fakeApi.fs.writeTextFile).toHaveBeenCalledWith("data/catalog-cache.json", JSON.stringify([{ id: "x" }]));
  });

  it("falls back to the cached copy and marks it stale when the fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as never;
    vi.mocked(fakeApi.fs.readTextFile).mockResolvedValue(JSON.stringify([{ id: "cached" }]));
    const result = await loadCatalog(fakeApi);
    expect(result.stale).toBe(true);
    expect(result.entries).toEqual([{ id: "cached" }]);
  });

  it("throws when the fetch fails and there is no cache", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as never;
    vi.mocked(fakeApi.fs.readTextFile).mockRejectedValue(new Error("no file"));
    await expect(loadCatalog(fakeApi)).rejects.toThrow(/could not reach the plugin catalog/);
  });
});
