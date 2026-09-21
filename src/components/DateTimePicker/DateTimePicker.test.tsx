/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker } from "./DateTimePicker";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("DateTimePicker", () => {
  it("renders both the date trigger and the time input with their values", () => {
    resetStore();
    render(<DateTimePicker value={{ date: "2024-03-15", time: "14:30" }} onChange={vi.fn()} />);

    expect(screen.getByRole("button").textContent).toBe("2024-03-15");
    expect(screen.getByDisplayValue("14:30")).toBeTruthy();
  });

  it("calls onChange with the updated date while preserving the time", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateTimePicker value={{ date: "2024-03-15", time: "14:30" }} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("20"));

    expect(onChange).toHaveBeenCalledWith({ date: "2024-03-20", time: "14:30" });
  });

  it("calls onChange with the updated time while preserving the date", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateTimePicker value={{ date: "2024-03-15", time: "14:30" }} onChange={onChange} />);

    const input = screen.getByDisplayValue("14:30") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "09:15");

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.date).toBe("2024-03-15");
  });

  it("disables both the date and time controls when disabled is true", () => {
    resetStore();
    render(<DateTimePicker value={{ date: "2024-03-15", time: "14:30" }} onChange={vi.fn()} disabled />);

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByDisplayValue("14:30") as HTMLInputElement).disabled).toBe(true);
  });
});
