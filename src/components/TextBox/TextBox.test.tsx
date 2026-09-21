/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextBox } from "./TextBox";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("TextBox", () => {
  it("renders the given value and placeholder", () => {
    resetStore();
    render(<TextBox value="hello" onChange={() => {}} placeholder="Type here" />);
    const textarea = screen.getByPlaceholderText("Type here") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
  });

  it("defaults to 10 rows", () => {
    resetStore();
    render(<TextBox value="" onChange={() => {}} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.rows).toBe(10);
  });

  it("uses a custom rows count when provided", () => {
    resetStore();
    render(<TextBox value="" onChange={() => {}} rows={3} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.rows).toBe(3);
  });

  it("calls onChange with the new text as the user types", async () => {
    resetStore();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextBox value="" onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "hi");

    expect(onChange).toHaveBeenCalledWith("h");
    expect(onChange).toHaveBeenCalledWith("i");
  });

  it("is read-only and does not accept input when readOnly is true", () => {
    resetStore();
    render(<TextBox value="locked" onChange={() => {}} readOnly />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
  });
});
