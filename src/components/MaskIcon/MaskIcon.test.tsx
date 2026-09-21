/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MaskIcon } from "./MaskIcon";

describe("MaskIcon", () => {
  it("renders nothing when png is not provided", () => {
    cleanup();
    const { container } = render(<MaskIcon alt="Icon" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an img-role element with the given alt text when png is provided", () => {
    cleanup();
    render(<MaskIcon png="data:image/png;base64,abc" alt="Refresh" />);
    expect(screen.getByRole("img", { name: "Refresh" })).toBeTruthy();
  });

  it("defaults to a 24px size", () => {
    cleanup();
    render(<MaskIcon png="data:image/png;base64,abc" alt="Refresh" />);
    const el = screen.getByRole("img", { name: "Refresh" });
    expect(el.style.width).toBe("24px");
    expect(el.style.height).toBe("24px");
  });

  it("uses a custom size and color when provided", () => {
    cleanup();
    render(<MaskIcon png="data:image/png;base64,abc" alt="Refresh" size={16} color="#ff0000" />);
    const el = screen.getByRole("img", { name: "Refresh" });
    expect(el.style.width).toBe("16px");
    expect(el.style.backgroundColor).toBe("rgb(255, 0, 0)");
  });
});
