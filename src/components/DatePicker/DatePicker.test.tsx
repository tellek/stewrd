/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./DatePicker";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("DatePicker", () => {
  it("shows the value on the trigger button when set", () => {
    resetStore();
    render(<DatePicker value="2024-03-15" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toBe("2024-03-15");
  });

  it("shows the placeholder when no value is set", () => {
    resetStore();
    render(<DatePicker value="" onChange={vi.fn()} placeholder="Pick a date" />);
    expect(screen.getByRole("button").textContent).toBe("Pick a date");
  });

  it("falls back to the default placeholder text when none is given", () => {
    resetStore();
    render(<DatePicker value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toBe("Select date...");
  });

  it("opens a Calendar popover on click", async () => {
    resetStore();
    const user = userEvent.setup();
    render(<DatePicker value="2024-03-15" onChange={vi.fn()} />);

    expect(screen.queryByText("March 2024")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("March 2024")).toBeTruthy();
  });

  it("calls onChange and closes the popover when a day is selected", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value="2024-03-15" onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("20"));

    expect(onChange).toHaveBeenCalledWith("2024-03-20");
    expect(screen.queryByText("March 2024")).toBeNull();
  });

  it("does not open when disabled", () => {
    resetStore();
    render(<DatePicker value="2024-03-15" onChange={vi.fn()} disabled />);

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByText("March 2024")).toBeNull();
  });

  it("closes when clicking outside the popover", async () => {
    resetStore();
    const user = userEvent.setup();
    render(
      <div>
        <DatePicker value="2024-03-15" onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    );

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("March 2024")).toBeTruthy();

    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByText("March 2024")).toBeNull();
  });
});
