/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dropdown } from "./Dropdown";
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

describe("Dropdown", () => {
  it("shows the selected option's label on the trigger button", () => {
    resetStore();
    render(<Dropdown options={options} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toBe("Bravo");
  });

  it("shows the placeholder when no option matches the value", () => {
    resetStore();
    render(<Dropdown options={options} value="" onChange={vi.fn()} placeholder="Pick one" />);
    expect(screen.getByRole("button").textContent).toBe("Pick one");
  });

  it("opens the option list on click and calls onChange when an option is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Dropdown options={options} value="a" onChange={onChange} />);

    expect(screen.queryByText("Bravo")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Bravo")).toBeTruthy();

    await user.click(screen.getByText("Bravo"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("closes the list after an option is selected", async () => {
    resetStore();
    const user = userEvent.setup();
    const { container } = render(<Dropdown options={options} value="a" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button"));
    expect(container.querySelectorAll("button ~ div").length).toBe(1);

    await user.click(screen.getByText("Bravo"));

    expect(container.querySelectorAll("button ~ div").length).toBe(0);
  });

  it("does not open when disabled", () => {
    resetStore();
    render(<Dropdown options={options} value="a" onChange={vi.fn()} disabled />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Bravo")).toBeNull();
  });

  it("closes when clicking outside the dropdown", async () => {
    resetStore();
    const user = userEvent.setup();
    render(
      <div>
        <Dropdown options={options} value="a" onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    );

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Bravo")).toBeTruthy();

    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByText("Bravo")).toBeNull();
  });
});
