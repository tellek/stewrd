/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RadioGroup } from "./RadioGroup";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
];

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("RadioGroup", () => {
  it("renders every option's label", () => {
    resetStore();
    render(<RadioGroup options={options} value="a" onChange={() => {}} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("calls onChange with the clicked option's value", () => {
    resetStore();
    const onChange = vi.fn();
    render(<RadioGroup options={options} value="a" onChange={onChange} />);

    const bravoSpan = screen.getByText("Bravo").querySelector("span") as HTMLElement;
    fireEvent.click(bravoSpan);

    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("does not call onChange when disabled", () => {
    resetStore();
    const onChange = vi.fn();
    render(<RadioGroup options={options} value="a" onChange={onChange} disabled />);

    const bravoSpan = screen.getByText("Bravo").querySelector("span") as HTMLElement;
    fireEvent.click(bravoSpan);

    expect(onChange).not.toHaveBeenCalled();
  });
});
