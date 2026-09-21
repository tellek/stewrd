import { describe, expect, it, vi } from "vitest";
import { createSidebarApi } from "./sidebar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("createSidebarApi stale-generation guard", () => {
  it("throws from setItems once isCurrent returns false", () => {
    const api = createSidebarApi("p", () => false);
    expect(() => api.setItems([])).toThrow("[plugin:p] api call after deactivation");
  });

  it("throws from setSelected once isCurrent returns false", () => {
    const api = createSidebarApi("p", () => false);
    expect(() => api.setSelected(null)).toThrow("[plugin:p] api call after deactivation");
  });

  it("does not throw while isCurrent returns true", () => {
    const api = createSidebarApi("p", () => true);
    expect(() => api.setItems([])).not.toThrow();
    expect(() => api.setSelected(null)).not.toThrow();
  });
});
