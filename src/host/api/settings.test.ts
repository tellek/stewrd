import { beforeEach, describe, expect, it, vi } from "vitest";

const readMock = vi.fn();
vi.mock("../loader/pluginDiscovery", () => ({ readPluginSettingsFile: (...a: unknown[]) => readMock(...a) }));

import { createSettingsApi } from "./settings";

beforeEach(() => readMock.mockReset());

describe("createSettingsApi", () => {
  it("reads the plugin folder's settings.json fresh on every call", async () => {
    readMock.mockResolvedValueOnce('{"greeting":"hi"}').mockResolvedValueOnce('{"greeting":"yo"}');
    const api = createSettingsApi("my-dir");
    expect(await api.get()).toEqual({ greeting: "hi" });
    expect(await api.get()).toEqual({ greeting: "yo" });
    expect(readMock).toHaveBeenCalledWith("my-dir");
  });

  it("reads malformed, non-object or unreadable settings as {}", async () => {
    const api = createSettingsApi("d");
    readMock.mockResolvedValueOnce("not json{{");
    expect(await api.get()).toEqual({});
    readMock.mockResolvedValueOnce("[1,2]");
    expect(await api.get()).toEqual({});
    readMock.mockRejectedValueOnce(new Error("gone"));
    expect(await api.get()).toEqual({});
  });
});
