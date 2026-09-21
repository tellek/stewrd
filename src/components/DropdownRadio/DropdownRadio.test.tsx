/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownRadio } from "./DropdownRadio";
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

describe("DropdownRadio", () => {
  it("shows the selected option's label on the trigger button", () => {
    resetStore();
    render(<DropdownRadio options={options} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toBe("Alpha");
  });

  it("opens to reveal radio inputs with the current value checked", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<DropdownRadio options={options} value="a" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button"));

    expect((screen.getByRole("radio", { name: "Alpha" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Bravo" }) as HTMLInputElement).checked).toBe(false);
  });

  it("calls onChange and closes the list when a different radio is picked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropdownRadio options={options} value="a" onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("radio", { name: "Bravo" }));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("radio", { name: "Bravo" })).toBeNull();
  });

  it("shows the placeholder when no option matches the value", () => {
    resetStore();
    render(<DropdownRadio options={options} value="" onChange={vi.fn()} placeholder="Choose" />);
    expect(screen.getByRole("button").textContent).toBe("Choose");
  });

  it("does not open when disabled", () => {
    resetStore();
    render(<DropdownRadio options={options} value="a" onChange={vi.fn()} disabled />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("radio", { name: "Bravo" })).toBeNull();
  });
});
