import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createPluginContext, destroyPluginContext } from "./createPluginApi";
import { useAppStore } from "../state/appStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mocked(invoke).mockResolvedValue(undefined);

describe("createPluginContext generation guard", () => {
  it("throws from a superseded generation's statusIcon.set/log.info/toast.show", () => {
    const gen1 = createPluginContext("p", 1);
    createPluginContext("p", 2); // supersedes gen1

    expect(() => gen1.ctx.api.statusIcon.set("warning")).toThrow("[plugin:p] api call after deactivation");
    expect(() => gen1.ctx.api.log.info("hi")).toThrow("[plugin:p] api call after deactivation");
    expect(() => gen1.ctx.api.toast.show({ message: "hi" })).toThrow("[plugin:p] api call after deactivation");
  });
});

describe("destroyPluginContext", () => {
  it("runs dispose-bag callbacks in order, tolerating a throwing one", () => {
    const created = createPluginContext("p2", 1);
    const order: number[] = [];
    created.ctx.onDispose(() => order.push(1));
    created.ctx.onDispose(() => {
      throw new Error("boom");
    });
    created.ctx.onDispose(() => order.push(3));

    expect(() => destroyPluginContext(created)).not.toThrow();
    expect(order).toEqual([1, 3]);
  });

  it("aborts the context's AbortSignal", () => {
    const created = createPluginContext("p3", 1);
    expect(created.ctx.signal.aborted).toBe(false);
    destroyPluginContext(created);
    expect(created.ctx.signal.aborted).toBe(true);
  });

  it("clears currentGeneration/sidebar state when destroying the current generation", () => {
    useAppStore.setState({ pluginsWithSidebarItems: ["p4"] });
    const created = createPluginContext("p4", 1);
    destroyPluginContext(created);

    // A fresh context for the same id should get a clean generation guard -
    // i.e. its own gen 1 calls should not immediately throw.
    const next = createPluginContext("p4", 5);
    expect(() => next.ctx.api.log.info("hi")).not.toThrow();
  });

  it("does not clear current generation's sidebar state when destroying a stale, already-superseded context", () => {
    useAppStore.setState({ pluginsWithSidebarItems: [] });
    const gen1 = createPluginContext("p5", 1);
    const gen2 = createPluginContext("p5", 2);
    useAppStore.getState().setSidebarItems("p5", [{ id: "x", label: "X", onClick: () => {} }]);

    destroyPluginContext(gen1); // stale - must not clear gen2's state

    expect(() => gen2.ctx.api.log.info("hi")).not.toThrow();
    expect(useAppStore.getState().pluginsWithSidebarItems).toContain("p5");
  });
});
