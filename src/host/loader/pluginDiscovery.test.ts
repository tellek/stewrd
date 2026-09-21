import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { setPluginCategoryFile } from "./pluginDiscovery";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("setPluginCategoryFile", () => {
  it("rewrites the category key while preserving other keys in valid existing JSON", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_plugin_settings_file") return Promise.resolve(JSON.stringify({ foo: "bar", category: "Old" }));
      return Promise.resolve(undefined);
    });

    await setPluginCategoryFile("dir", "New");

    const writeCall = mockInvoke.mock.calls.find(([cmd]) => cmd === "write_plugin_settings_file");
    const written = JSON.parse((writeCall?.[1] as { contents: string }).contents);
    expect(written).toEqual({ foo: "bar", category: "New" });
  });

  it("falls back to an empty object when the existing content is malformed", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_plugin_settings_file") return Promise.resolve("not json{{{");
      return Promise.resolve(undefined);
    });

    await setPluginCategoryFile("dir", "New");

    const writeCall = mockInvoke.mock.calls.find(([cmd]) => cmd === "write_plugin_settings_file");
    const written = JSON.parse((writeCall?.[1] as { contents: string }).contents);
    expect(written).toEqual({ category: "New" });
  });
});
