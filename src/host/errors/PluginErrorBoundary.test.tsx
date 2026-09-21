/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PluginErrorBoundary } from "./PluginErrorBoundary";

function resetStore() {
  cleanup();
}

// React (dev mode) can invoke a throwing function component's render twice
// before the error boundary catches it, so a plain boolean flag gets
// consumed by the first "throwaway" render and never reaches the boundary.
// Counting down from a generous budget survives that double-invoke while
// still going to zero (stop throwing) after the boundary's reload re-render.
let throwBudget = 0;

function ThrowsOnce() {
  if (throwBudget > 0) {
    throwBudget--;
    throw new Error("boom");
  }
  return <div>Recovered</div>;
}

function AlwaysWorks() {
  return <div>Fine</div>;
}

describe("PluginErrorBoundary", () => {
  it("renders children when there's no error", () => {
    resetStore();
    render(
      <PluginErrorBoundary pluginId="notepad">
        <AlwaysWorks />
      </PluginErrorBoundary>,
    );
    expect(screen.getByText("Fine")).toBeTruthy();
  });

  it("catches a render error and shows an error banner with the plugin id and message", () => {
    resetStore();
    throwBudget = 4;
    render(
      <PluginErrorBoundary pluginId="notepad">
        <ThrowsOnce />
      </PluginErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText('Plugin "notepad" crashed: boom')).toBeTruthy();
  });

  it("calls onReload and clears the error when the child no longer throws", async () => {
    resetStore();
    const user = userEvent.setup();
    const onReload = vi.fn();
    throwBudget = 4;
    render(
      <PluginErrorBoundary pluginId="notepad" onReload={onReload}>
        <ThrowsOnce />
      </PluginErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    throwBudget = 0;
    await user.click(screen.getByRole("button", { name: "Reload This Plugin" }));

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recovered")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
