/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePluginModal } from "./CreatePluginModal";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

const mocks = vi.hoisted(() => ({
  checkPrerequisites: vi.fn(),
  checkName: vi.fn(),
  stepRuns: [] as Array<(...args: unknown[]) => Promise<void>>,
  invoke: vi.fn(),
  reveal: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => mocks.invoke(...a) }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: (...a: unknown[]) => mocks.reveal(...a),
  openUrl: (...a: unknown[]) => mocks.openUrl(...a),
}));
vi.mock("./createPluginSteps", async () => {
  const actual = await vi.importActual<typeof import("./createPluginSteps")>("./createPluginSteps");
  return {
    ...actual,
    checkPrerequisites: () => mocks.checkPrerequisites(),
    checkName: (...a: unknown[]) => mocks.checkName(...a),
    STEPS: ["repo", "clone", "scaffold", "push"].map((key, i) => ({
      key,
      label: key,
      run: (...a: unknown[]) => mocks.stepRuns[i](...a),
    })),
  };
});

beforeEach(() => {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
  mocks.checkPrerequisites.mockReset().mockResolvedValue({ ok: true, problems: [], owner: "octo" });
  mocks.checkName.mockReset().mockResolvedValue({ kind: "new", id: "my-plugin" });
  mocks.stepRuns = [0, 1, 2, 3].map(() => vi.fn().mockResolvedValue(undefined)) as unknown as typeof mocks.stepRuns;
  mocks.invoke.mockReset().mockResolvedValue("C:\\app\\plugins");
  mocks.reveal.mockReset().mockResolvedValue(undefined);
  mocks.openUrl.mockReset().mockResolvedValue(undefined);
});

describe("CreatePluginModal", () => {
  it("greys out Create and shows the warning when prerequisites fail", async () => {
    mocks.checkPrerequisites.mockResolvedValue({ ok: false, problems: ["GitHub CLI must be installed and signed in: run `gh auth login`."], owner: "" });
    render(<CreatePluginModal open onClose={() => {}} />);

    expect(await screen.findByText(/gh auth login/)).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create Repository And Plugin" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
  });

  it("enables Create only after a valid name, then runs every step and finishes", async () => {
    const user = userEvent.setup();
    render(<CreatePluginModal open onClose={() => {}} />);

    const create = screen.getByRole("button", { name: "Create Repository And Plugin" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    await user.type(await screen.findByPlaceholderText("My Plugin"), "My Plugin");
    await waitFor(() => expect(create.disabled).toBe(false));

    await user.click(create);

    expect(await screen.findByText("Your plugin is complete and ready to be worked on.")).toBeTruthy();
    mocks.stepRuns.forEach((run) => expect(run).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Show In Folder" }));
    expect(mocks.reveal).toHaveBeenCalledWith("C:\\app\\plugins\\my-plugin");
    await user.click(screen.getByText("https://github.com/octo/stewrd-my-plugin"));
    expect(mocks.openUrl).toHaveBeenCalledWith("https://github.com/octo/stewrd-my-plugin");
  });

  it("keeps Create disabled for an invalid name and shows why", async () => {
    mocks.checkName.mockResolvedValue({ kind: "invalid", message: "my-plugin already exists. Pick another name." });
    const user = userEvent.setup();
    render(<CreatePluginModal open onClose={() => {}} />);

    await user.type(await screen.findByPlaceholderText("My Plugin"), "My Plugin");

    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create Repository And Plugin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stops at a failing step, shows the error, and Retry skips the steps that already succeeded", async () => {
    (mocks.stepRuns[1] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Cloning the repository failed: boom"));
    const user = userEvent.setup();
    render(<CreatePluginModal open onClose={() => {}} />);
    await user.type(await screen.findByPlaceholderText("My Plugin"), "My Plugin");
    const create = screen.getByRole("button", { name: "Create Repository And Plugin" }) as HTMLButtonElement;
    await waitFor(() => expect(create.disabled).toBe(false));
    await user.click(create);

    expect(await screen.findByText("Cloning the repository failed: boom")).toBeTruthy();
    expect(mocks.stepRuns[2]).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Your plugin is complete and ready to be worked on.")).toBeTruthy();
    expect(mocks.stepRuns[0]).toHaveBeenCalledTimes(1); // repo step was already done
    expect(mocks.stepRuns[1]).toHaveBeenCalledTimes(2);
  });
});
