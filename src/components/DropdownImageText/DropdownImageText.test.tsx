/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownImageText } from "./DropdownImageText";
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

describe("DropdownImageText", () => {
  it("shows the selected option's label and image on the trigger button", () => {
    resetStore();
    render(<DropdownImageText options={options} value="a" onChange={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Alpha");
    expect((button.querySelector("img") as HTMLImageElement).src).toContain("AAA");
  });

  it("opens to reveal every option's label and image", async () => {
    resetStore();
    const user = userEvent.setup();
    const { container } = render(<DropdownImageText options={options} value="a" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Bravo")).toBeTruthy();
    // trigger button's own selected-option image plus one per option in the list
    expect(container.querySelectorAll("img").length).toBe(3);
  });

  it("calls onChange and closes the list when an option is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropdownImageText options={options} value="a" onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("Bravo"));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByText("Bravo")).toBeNull();
  });

  it("shows the placeholder and no image when no option matches the value", () => {
    resetStore();
    render(<DropdownImageText options={options} value="" onChange={vi.fn()} placeholder="Choose" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Choose");
    expect(button.querySelector("img")).toBeNull();
  });
});
