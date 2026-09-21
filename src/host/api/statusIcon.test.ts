import { describe, expect, it, vi } from "vitest";
import { createStatusIconApi } from "./statusIcon";
import { useAppStore } from "../state/appStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("createStatusIconApi", () => {
  it("get() falls back to idle for a plugin id that was never set", () => {
    useAppStore.setState({ plugins: {} });
    const api = createStatusIconApi("never-set");
    expect(api.get()).toBe("idle");
  });

  it("get() reflects a status previously set via set()", () => {
    useAppStore.setState({
      plugins: {
        p: {
          manifest: { id: "p", name: "p", icon: "", entry: "", description: "", apiVersion: "1", background: false },
          status: "idle",
          dir: "p",
          category: "Other",
        },
      },
    });
    const api = createStatusIconApi("p");
    api.set("warning");
    expect(api.get()).toBe("warning");
  });
});
