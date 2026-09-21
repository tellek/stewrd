/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "./IconButton";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("IconButton", () => {
  it("exposes the label as an accessible name and calls onClick when clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="data:image/png;base64,abc" label="Refresh" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Refresh" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no icon element when icon is omitted", () => {
    resetStore();
    render(<IconButton label="Refresh" onClick={() => {}} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the icon as a masked image when provided", () => {
    resetStore();
    render(<IconButton icon="data:image/png;base64,abc" label="Refresh" onClick={() => {}} />);
    expect(screen.getByRole("img", { name: "Refresh" })).toBeTruthy();
  });

  it("is disabled when disabled is true", () => {
    resetStore();
    render(<IconButton icon="data:image/png;base64,abc" label="Refresh" onClick={() => {}} disabled />);
    const button = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
