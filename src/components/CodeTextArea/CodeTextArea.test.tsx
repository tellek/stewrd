/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CodeTextArea } from "./CodeTextArea";
import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

function resetStore() {
  cleanup();
  useAppStore.setState({ palette: defaultPalette });
}

describe("CodeTextArea", () => {
  it("renders a container div sized from width/height props", () => {
    resetStore();
    const { container } = render(
      <CodeTextArea value='{"a":1}' onChange={vi.fn()} language="json" width={300} height={150} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe("300px");
    expect(wrapper.style.height).toBe("150px");
  });

  it("defaults to 100% width when no width prop is given", () => {
    resetStore();
    const { container } = render(<CodeTextArea value="" onChange={vi.fn()} language="json" height={100} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe("100%");
  });

  it("mounts CodeMirror and renders the initial doc content", () => {
    resetStore();
    const { container } = render(<CodeTextArea value='{"a":1}' onChange={vi.fn()} language="json" />);
    expect(container.querySelector(".cm-editor")).toBeTruthy();
    expect(container.textContent).toContain('{"a":1}');
  });

  it("marks the editor non-editable when readOnly is true", () => {
    resetStore();
    const { container } = render(<CodeTextArea value="{}" onChange={vi.fn()} language="json" readOnly />);
    const content = container.querySelector(".cm-content") as HTMLElement;
    expect(content.getAttribute("contenteditable")).toBe("false");
  });

  it("is editable when readOnly is not set", () => {
    resetStore();
    const { container } = render(<CodeTextArea value="{}" onChange={vi.fn()} language="json" />);
    const content = container.querySelector(".cm-content") as HTMLElement;
    expect(content.getAttribute("contenteditable")).toBe("true");
  });

  it("re-renders the doc content when the value prop changes externally", () => {
    resetStore();
    const { container, rerender } = render(<CodeTextArea value='{"a":1}' onChange={vi.fn()} language="json" />);
    expect(container.textContent).toContain('{"a":1}');

    rerender(<CodeTextArea value='{"b":2}' onChange={vi.fn()} language="json" />);

    expect(container.textContent).toContain('{"b":2}');
  });
});
