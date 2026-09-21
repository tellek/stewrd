/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimePicker } from "./TimePicker";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("TimePicker", () => {
  it("renders a native time input with the given value", () => {
    resetStore();
    render(<TimePicker value="14:30" onChange={vi.fn()} />);
    const input = screen.getByDisplayValue("14:30") as HTMLInputElement;
    expect(input.type).toBe("time");
  });

  it("calls onChange with the new value when edited", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimePicker value="09:00" onChange={onChange} />);

    const input = screen.getByDisplayValue("09:00") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "10:15");

    expect(onChange).toHaveBeenCalled();
  });

  it("is disabled when disabled is true", () => {
    resetStore();
    render(<TimePicker value="09:00" onChange={vi.fn()} disabled />);
    const input = screen.getByDisplayValue("09:00") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
