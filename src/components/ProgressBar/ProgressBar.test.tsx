/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("ProgressBar", () => {
  it("renders the fill width matching the given value", () => {
    resetStore();
    const { container } = render(<ProgressBar value={42} />);
    const fill = container.querySelector("div > div > div") as HTMLElement;
    expect(fill.style.width).toBe("42%");
  });

  it("clamps a value above 100 down to 100%", () => {
    resetStore();
    const { container } = render(<ProgressBar value={150} />);
    const fill = container.querySelector("div > div > div") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("clamps a negative value up to 0%", () => {
    resetStore();
    const { container } = render(<ProgressBar value={-10} />);
    const fill = container.querySelector("div > div > div") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("renders an indeterminate 40% fill when value is omitted", () => {
    resetStore();
    const { container } = render(<ProgressBar />);
    const fill = container.querySelector("div > div > div") as HTMLElement;
    expect(fill.style.width).toBe("40%");
    expect(fill.style.animation).toContain("stewrd-progress-indeterminate");
  });
});
