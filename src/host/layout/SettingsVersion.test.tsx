/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SettingsVersion } from "./SettingsVersion";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { getVersion } from "@tauri-apps/api/app";
import { listReleases, pendingUpdateVersion } from "../api/updates";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("../api/updates", () => ({ listReleases: vi.fn(), pendingUpdateVersion: vi.fn() }));

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
  vi.mocked(getVersion).mockReset();
  vi.mocked(listReleases).mockReset();
  vi.mocked(pendingUpdateVersion).mockReset();
}

describe("SettingsVersion", () => {
  it("shows the installed version once getVersion resolves", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
    vi.mocked(listReleases).mockResolvedValue([]);
    render(<SettingsVersion />);

    expect(await screen.findByText("Installed version: 1.0.0")).toBeTruthy();
  });

  it("shows an update-available message when the latest release is newer than installed", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
    vi.mocked(listReleases).mockResolvedValue([
      { tag: "v1.1.0", name: "1.1.0", body: "Notes", publishedAt: null, url: "" },
    ]);
    render(<SettingsVersion />);

    expect(await screen.findByText("Update v1.1.0 available.")).toBeTruthy();
  });

  it("shows an update-ready message when a pending version differs from installed", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue("1.1.0");
    vi.mocked(listReleases).mockResolvedValue([]);
    render(<SettingsVersion />);

    expect(await screen.findByText("Update v1.1.0 ready — restart to apply.")).toBeTruthy();
  });

  it("shows the up-to-date message when installed matches the latest release", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
    vi.mocked(listReleases).mockResolvedValue([
      { tag: "v1.0.0", name: "1.0.0", body: "Notes", publishedAt: null, url: "" },
    ]);
    render(<SettingsVersion />);

    expect(await screen.findByText("You're on the latest version.")).toBeTruthy();
  });

  it("shows a rate-limited message when listReleases rejects with a rate-limit error", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
    vi.mocked(listReleases).mockRejectedValue(new Error("Rate limited by GitHub"));
    render(<SettingsVersion />);

    expect(await screen.findByText("Rate limited by GitHub — try again later.")).toBeTruthy();
  });

  it("renders the installed release's notes when it matches a listed release", async () => {
    resetStore();
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(pendingUpdateVersion).mockResolvedValue(null);
    vi.mocked(listReleases).mockResolvedValue([
      { tag: "v1.0.0", name: "Release 1.0.0", body: "Fixed things.", publishedAt: null, url: "" },
    ]);
    render(<SettingsVersion />);

    await waitFor(() => expect(screen.getByText("Release 1.0.0")).toBeTruthy());
    expect(screen.getByText("Fixed things.")).toBeTruthy();
  });
});
