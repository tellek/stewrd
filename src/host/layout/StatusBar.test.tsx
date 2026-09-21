/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusBar } from "./StatusBar";
import { useAppStore, type StatusLogEntry } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore(statusLog: StatusLogEntry[] = []) {
  cleanup();
  useAppStore.setState({ palette: defaultPalette, statusLog, categoryIconFiles: [] });
}

describe("StatusBar", () => {
  it("shows Ready when there's no log entry", () => {
    resetStore();
    render(<StatusBar />);
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("shows the latest log entry's message collapsed", () => {
    resetStore([
      { id: 1, timestamp: 1000, level: "idle", message: "First" },
      { id: 2, timestamp: 2000, level: "success", message: "Second" },
    ]);
    render(<StatusBar />);
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByText("First")).toBeNull();
  });

  it("expands to show the full log, newest first, when clicked", async () => {
    resetStore([
      { id: 1, timestamp: 1000, level: "idle", message: "First" },
      { id: 2, timestamp: 2000, level: "success", message: "Second" },
    ]);
    const user = userEvent.setup();
    render(<StatusBar />);

    await user.click(screen.getByText("Second"));

    expect(screen.getByText(/First$/)).toBeTruthy();
  });

  it("shows 'No log entries yet.' when expanded with an empty log", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<StatusBar />);

    await user.click(screen.getByText("Ready"));

    expect(screen.getByText("No log entries yet.")).toBeTruthy();
  });
});
