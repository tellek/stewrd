/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RangeSlider } from "./RangeSlider";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("RangeSlider", () => {
  it("renders a range input with the given value, min, max, and step", () => {
    resetStore();
    render(<RangeSlider value={40} onChange={vi.fn()} min={0} max={100} step={5} />);
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.value).toBe("40");
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");
    expect(input.step).toBe("5");
  });

  it("defaults min to 0, max to 100, and step to 1 when not provided", () => {
    resetStore();
    render(<RangeSlider value={10} onChange={vi.fn()} />);
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");
    expect(input.step).toBe("1");
  });

  it("calls onChange with a number when the input value changes", () => {
    resetStore();
    const onChange = vi.fn();
    render(<RangeSlider value={10} onChange={onChange} />);
    const input = screen.getByRole("slider") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "70" } });

    expect(onChange).toHaveBeenCalledWith(70);
  });

  it("is disabled when disabled is passed", () => {
    resetStore();
    render(<RangeSlider value={10} onChange={vi.fn()} disabled />);
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  });

  it("colors the filled portion of the track with the palette's accent color", () => {
    resetStore();
    render(<RangeSlider value={50} onChange={vi.fn()} min={0} max={100} />);
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.style.background).toContain(hexToRgb(defaultPalette.accent));
  });
});
