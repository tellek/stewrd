import { describe, expect, it, vi } from "vitest";
import { createModalApi, promptModal, resolveModal } from "./modals";
import { useAppStore } from "../state/appStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("createModalApi confirm/resolveModal round-trip", () => {
  it("resolves with the value passed to resolveModal for the pushed modal's id", async () => {
    useAppStore.setState({ modalQueue: [] });
    const promise = createModalApi().confirm({ title: "Sure?", message: "msg" });
    const pushed = useAppStore.getState().modalQueue[0];
    resolveModal(pushed.id, true);
    await expect(promise).resolves.toBe(true);
  });

  it("uses Confirm/Cancel as the default button labels", () => {
    useAppStore.setState({ modalQueue: [] });
    void createModalApi().confirm({ title: "Sure?", message: "msg" });
    const pushed = useAppStore.getState().modalQueue[0];
    expect(pushed.confirmLabel).toBe("Confirm");
    expect(pushed.cancelLabel).toBe("Cancel");
  });

  it("removes the modal from the store on resolveModal", () => {
    useAppStore.setState({ modalQueue: [] });
    void createModalApi().confirm({ title: "Sure?", message: "msg" });
    const pushed = useAppStore.getState().modalQueue[0];
    resolveModal(pushed.id, false);
    expect(useAppStore.getState().modalQueue).toHaveLength(0);
  });
});

describe("promptModal", () => {
  it("resolves null on cancel", async () => {
    useAppStore.setState({ modalQueue: [] });
    const promise = promptModal({ title: "Name", message: "msg" });
    const pushed = useAppStore.getState().modalQueue[0];
    resolveModal(pushed.id, null);
    await expect(promise).resolves.toBeNull();
  });
});

describe("resolveModal safety", () => {
  it("is a safe no-op for an unknown modal id", () => {
    expect(() => resolveModal(999999, "anything")).not.toThrow();
  });

  it("is a safe no-op when called twice for the same id", async () => {
    useAppStore.setState({ modalQueue: [] });
    const promise = createModalApi().confirm({ title: "Sure?", message: "msg" });
    const pushed = useAppStore.getState().modalQueue[0];
    resolveModal(pushed.id, true);
    expect(() => resolveModal(pushed.id, false)).not.toThrow();
    await expect(promise).resolves.toBe(true);
  });
});
