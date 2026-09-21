/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Checkbox } from "./Checkbox";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("Checkbox", () => {
  it("calls onChange with true when an unchecked checkbox is clicked", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} label="Enable Feature" />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when a checked checkbox is clicked", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={true} onChange={onChange} label="Enable Feature" />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not call onChange when disabled", () => {
    resetStore();
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} label="Enable Feature" disabled />);

    fireEvent.click(container.querySelector("span") as HTMLElement);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders no checkmark svg when unchecked", () => {
    resetStore();
    const { container } = render(<Checkbox checked={false} onChange={() => {}} label="Enable Feature" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a checkmark svg when checked", () => {
    resetStore();
    const { container } = render(<Checkbox checked={true} onChange={() => {}} label="Enable Feature" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
