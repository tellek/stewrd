/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu } from "./Menu";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("Menu", () => {
  it("renders the trigger and keeps items hidden until clicked", () => {
    resetStore();
    render(<Menu trigger={<span>Open Menu</span>} items={[{ label: "Rename", onClick: vi.fn() }]} />);
    expect(screen.getByText("Open Menu")).toBeTruthy();
    expect(screen.queryByText("Rename")).toBeNull();
  });

  it("shows the item list after clicking the trigger", async () => {
    resetStore();
    const user = userEvent.setup();
    render(
      <Menu
        trigger={<span>Open Menu</span>}
        items={[
          { label: "Rename", onClick: vi.fn() },
          { label: "Delete", onClick: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByText("Open Menu"));

    expect(screen.getByText("Rename")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("calls the clicked item's onClick and closes the menu", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Menu trigger={<span>Open Menu</span>} items={[{ label: "Rename", onClick }]} />);

    await user.click(screen.getByText("Open Menu"));
    await user.click(screen.getByText("Rename"));

    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByText("Rename")).toBeNull();
  });

  it("does not call onClick and keeps the menu open when a disabled item is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Menu trigger={<span>Open Menu</span>} items={[{ label: "Delete", onClick, disabled: true }]} />);

    await user.click(screen.getByText("Open Menu"));
    fireEvent.click(screen.getByText("Delete"));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});
