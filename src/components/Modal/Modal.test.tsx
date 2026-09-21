/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";
import { useAppStore } from "../../host/state/appStore";
import { createModalApi, promptModal } from "../../host/api/modals";

function resetModalQueue() {
  cleanup();
  useAppStore.setState({ modalQueue: [] });
}

describe("Modal", () => {
  it("renders an error modal with a Title Case OK button and resolves on click", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.error({ title: "Save Failed", message: "Could not save the file." });
    render(<Modal />);

    expect(screen.getByText("Save Failed")).toBeTruthy();
    expect(screen.getByText("Could not save the file.")).toBeTruthy();
    const okButton = screen.getByRole("button", { name: "OK" });
    await user.click(okButton);

    await expect(result).resolves.toBeUndefined();
  });

  it("renders an info modal with a Title Case OK button", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.info({ title: "Update Available", message: "A new version is ready." });
    render(<Modal />);

    await user.click(screen.getByRole("button", { name: "OK" }));

    await expect(result).resolves.toBeUndefined();
  });

  it("resolves true when the confirm modal's Confirm button is clicked", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.confirm({ title: "Delete Item", message: "Are you sure?" });
    render(<Modal />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await expect(result).resolves.toBe(true);
  });

  it("resolves false when the confirm modal's Cancel button is clicked", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.confirm({ title: "Delete Item", message: "Are you sure?" });
    render(<Modal />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(result).resolves.toBe(false);
  });

  it("uses custom confirmLabel/cancelLabel when provided", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.confirm({
      title: "Discard Changes",
      message: "Discard unsaved changes?",
      confirmLabel: "Discard",
      cancelLabel: "Keep Editing",
    });
    render(<Modal />);

    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep Editing" }));

    await expect(result).resolves.toBe(false);
  });

  it("resolves with the clicked option's label for a question modal", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const api = createModalApi();
    const result = api.question({
      title: "Unsaved Changes",
      message: "What would you like to do?",
      buttons: ["Save", "Discard", "Cancel"],
    });
    render(<Modal />);

    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard" }));

    await expect(result).resolves.toBe("Discard");
  });

  it("enforces maxLength on the prompt input", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const result = promptModal({ title: "Rename Layout", message: "Enter a name.", maxLength: 5 });
    render(<Modal />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.maxLength).toBe(5);

    await user.type(input, "abcdefgh");
    expect(input.value).toBe("abcde");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await expect(result).resolves.toBe("abcde");
  });

  it("populates the prompt input with the request's initialValue", () => {
    resetModalQueue();
    useAppStore
      .getState()
      .pushModal({ id: 999, kind: "prompt", title: "Rename Layout", message: "Enter a name.", initialValue: "Old Name" });
    render(<Modal />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Old Name");
  });

  it("resolves null when the prompt modal is cancelled", async () => {
    resetModalQueue();
    const user = userEvent.setup();
    const result = promptModal({ title: "Rename Layout", message: "Enter a name." });
    render(<Modal />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(result).resolves.toBeNull();
  });

  it("renders nothing when the modal queue is empty", () => {
    resetModalQueue();
    const { container } = render(<Modal />);
    expect(container.firstChild).toBeNull();
  });
});
