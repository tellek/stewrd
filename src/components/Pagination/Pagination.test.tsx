/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("Pagination", () => {
  it("renders the current page and page count", () => {
    resetStore();
    render(<Pagination page={2} pageCount={5} onChange={vi.fn()} />);
    expect(screen.getByText("Page 2 of 5")).toBeTruthy();
  });

  it("disables Prev on the first page and Next on the last page", () => {
    resetStore();
    const { rerender } = render(<Pagination page={1} pageCount={3} onChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Prev" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<Pagination page={3} pageCount={3} onChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Prev" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onChange with page - 1 when Prev is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} pageCount={5} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Prev" }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("calls onChange with page + 1 when Next is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} pageCount={5} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("does not call onChange when clicking a disabled Prev/Next button", () => {
    resetStore();
    const onChange = vi.fn();
    render(<Pagination page={1} pageCount={1} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
