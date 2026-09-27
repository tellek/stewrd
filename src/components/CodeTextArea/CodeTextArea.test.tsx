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

  it("accepts a string height", () => {
    resetStore();
    const { container } = render(<CodeTextArea value="" onChange={vi.fn()} language="json" height="100%" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.height).toBe("100%");
  });

  it("mounts CodeMirror with markdown content", () => {
    resetStore();
    const { container } = render(<CodeTextArea value="# Heading" onChange={vi.fn()} language="markdown" />);
    expect(container.querySelector(".cm-editor")).toBeTruthy();
    expect(container.textContent).toContain("# Heading");
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

  it("styles the CodeMirror scroller with the palette-driven thin scrollbar", () => {
    resetStore();
    render(<CodeTextArea value="{}" onChange={vi.fn()} language="json" />);
    const css = Array.from(document.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    const scrollerRules = css.match(/[^}]*\.cm-scroller \{[^}]*}/g) ?? [];
    expect(
      scrollerRules.some(
        (rule) =>
          rule.includes("scrollbar-width: thin") &&
          rule.includes(`scrollbar-color: ${defaultPalette.border} ${defaultPalette.surface}`),
      ),
    ).toBe(true);
  });
});
