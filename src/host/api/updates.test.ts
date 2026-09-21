import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listReleases } from "./updates";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("listReleases", () => {
  it("invokes list_releases on the first call, reuses the cache within the TTL, and re-invokes after it expires", async () => {
    vi.useFakeTimers();
    try {
      const releases = [{ tag: "v1", name: "v1", body: "", publishedAt: null, url: "" }];
      mockInvoke.mockResolvedValue(releases);

      const first = await listReleases();
      expect(first).toEqual(releases);
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 60 * 1000);
      const second = await listReleases();
      expect(second).toEqual(releases);
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 6 * 60 * 1000);
      await listReleases();
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
