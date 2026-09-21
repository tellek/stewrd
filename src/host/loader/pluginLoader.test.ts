import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { unloadPlugin, type LoadedPlugin } from "./pluginLoader";
import { createPluginContext, destroyPluginContext } from "../api/createPluginApi";
import type { PluginManifest } from "../../shared/plugin-api.d.ts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mocked(invoke).mockResolvedValue(undefined);

vi.mock("../api/createPluginApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/createPluginApi")>();
  return {
    ...actual,
    destroyPluginContext: vi.fn(actual.destroyPluginContext),
  };
});

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function manifest(): PluginManifest {
  return { id: "p", name: "p", icon: "", entry: "", description: "", apiVersion: "1", background: false };
}

describe("unloadPlugin", () => {
  it("still calls destroyPluginContext and revokes the blob URL when deactivate() throws", () => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();

    const createdContext = createPluginContext("p", 1);
    const loaded: LoadedPlugin = {
      manifest: manifest(),
      module: {
        Component: () => null,
        activate: vi.fn(),
        deactivate: vi.fn(() => {
          throw new Error("boom");
        }),
      },
      api: createdContext.ctx.api,
      blobUrl: "blob:fake",
      generation: 1,
      createdContext,
    };

    expect(() => unloadPlugin(loaded)).toThrow("boom");

    expect(vi.mocked(destroyPluginContext)).toHaveBeenCalledWith(createdContext);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
