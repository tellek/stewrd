/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownImageGrid } from "./DropdownImageGrid";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

const options = [
  { value: "a", label: "Alpha", image: "data:image/png;base64,AAA" },
  { value: "b", label: "Bravo", image: "data:image/png;base64,BBB" },
];

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("DropdownImageGrid", () => {
  it("shows the selected option's label and image on the trigger button", () => {
    resetStore();
    render(<DropdownImageGrid options={options} value="a" onChange={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Alpha");
    expect((button.querySelector("img") as HTMLImageElement).src).toContain("AAA");
  });

  it("opens a grid with a titled cell for every option", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<DropdownImageGrid options={options} value="a" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByTitle("Bravo")).toBeTruthy();
    expect(screen.getByTitle("Alpha")).toBeTruthy();
  });

  it("calls onChange and closes the grid when a cell is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropdownImageGrid options={options} value="a" onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByTitle("Bravo"));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByTitle("Bravo")).toBeNull();
  });

  it("renders images as MaskIcon spans instead of <img> when tint is provided", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<DropdownImageGrid options={options} value="a" onChange={vi.fn()} tint={defaultPalette.accent} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByTitle("Bravo").querySelector("img")).toBeNull();
  });
});
