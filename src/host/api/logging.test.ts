import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createLogApi } from "./logging";
import { useAppStore } from "../state/appStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("createLogApi", () => {
  it("maps info to the idle status", () => {
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({ statusLog: [] });
    createLogApi("p").info("hello");
    expect(useAppStore.getState().statusLog[0].level).toBe("idle");
  });

  it("maps warn to the warning status", () => {
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({ statusLog: [] });
    createLogApi("p").warn("hello");
    expect(useAppStore.getState().statusLog[0].level).toBe("warning");
  });

  it("maps error to the error status", () => {
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({ statusLog: [] });
    createLogApi("p").error("hello");
    expect(useAppStore.getState().statusLog[0].level).toBe("error");
  });
});
