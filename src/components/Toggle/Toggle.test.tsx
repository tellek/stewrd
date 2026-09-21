/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Toggle } from "./Toggle";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("Toggle", () => {
  it("calls onChange with true when an unchecked toggle is clicked", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Toggle checked={false} onChange={onChange} label="Auto Update" />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when a checked toggle is clicked", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Toggle checked={true} onChange={onChange} label="Auto Update" />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not call onChange when disabled", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Toggle checked={false} onChange={onChange} label="Auto Update" disabled />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).not.toHaveBeenCalled();
  });
});
