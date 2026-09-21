/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DropdownCheckboxes } from "./DropdownCheckboxes";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

/** Wraps DropdownCheckboxes with real state so onChange accumulation is
 * exercised the way a real consumer would use it. */
function ControlledDropdown() {
  const [values, setValues] = useState<string[]>([]);
  return <DropdownCheckboxes options={options} values={values} onChange={setValues} />;
}

describe("DropdownCheckboxes", () => {
  it("accumulates selections as multiple checkbox items are clicked", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<ControlledDropdown />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await user.click(screen.getByRole("checkbox", { name: "Charlie" }));

    expect((screen.getByRole("checkbox", { name: "Alpha" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Charlie" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Bravo" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("button").textContent).toBe("Alpha, Charlie");
  });

  it("removes only the toggled-off item when a checked box is clicked again", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<ControlledDropdown />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await user.click(screen.getByRole("checkbox", { name: "Bravo" }));
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));

    expect((screen.getByRole("checkbox", { name: "Alpha" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Bravo" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button").textContent).toBe("Bravo");
  });

  it("calls onChange with the accumulated array rather than replacing it", async () => {
    cleanup();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropdownCheckboxes options={options} values={["a"]} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("checkbox", { name: "Bravo" }));

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });
});
