/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Banner } from "./Banner";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  vi.useRealTimers();
  useAppStore.setState({ palette: defaultPalette });
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("Banner", () => {
  it("renders the message", () => {
    resetStore();
    render(<Banner message="Update available." />);
    expect(screen.getByText("Update available.")).toBeTruthy();
  });

  it("uses the status tone color for the outline border by default", () => {
    resetStore();
    const { container } = render(<Banner message="Something failed." tone="error" />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.border).toContain(hexToRgb(defaultPalette.status.error));
  });

  it("fills the background with the tone color for the solid variant", () => {
    resetStore();
    const { container } = render(<Banner message="Saved." tone="success" variant="solid" />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toBe(hexToRgb(defaultPalette.status.success));
  });

  it("renders no dismiss button when onDismiss is not provided", () => {
    resetStore();
    render(<Banner message="Info only." />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("fades out and calls onDismiss after the dismiss button is clicked", async () => {
    resetStore();
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Banner message="Dismissible." onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });
});
