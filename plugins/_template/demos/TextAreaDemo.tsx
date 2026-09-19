import { useState, type CSSProperties } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Palette-driven scrollbar for any plugin-owned scrollable element (a
 * <textarea>, a custom CodeMirror instance, a long list, etc.) - there's no
 * shared component for this since it's just a style on a raw scroll
 * container, not a UI widget. Standard `scrollbar-color`/`scrollbar-width`
 * (Chromium/WebView2 and Firefox both support them) beats `::-webkit-
 * scrollbar-*` here since those are pseudo-elements and can't be expressed
 * as an inline `style` object at all - copy this helper into any plugin
 * that needs one instead of reaching for raw browser-default scrollbars. */
export function scrollbarStyle(palette: PluginApi["theme"]["palette"]): CSSProperties {
  return { scrollbarWidth: "thin", scrollbarColor: `${palette.border} ${palette.surface}` };
}

/** Demonstrates api.ui.CodeTextArea (CodeMirror-backed, palette-themed). */
export function TextAreaDemo({ api }: { api: PluginApi }) {
  const [code, setCode] = useState('{\n  "hello": "world"\n}');

  return (
    <div>
      <p>JSON editor, fixed 400x200 with word-wrap, syntax colors follow the active palette live:</p>
      <api.ui.CodeTextArea value={code} onChange={setCode} language="json" width={400} height={200} />

      <p>Palette-colored scrollbar on a plain scrollable div (see `scrollbarStyle` above):</p>
      <div style={{ ...scrollbarStyle(api.theme.palette), height: 100, overflow: "auto", border: `1px solid ${api.theme.palette.border}` }}>
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i}>Line {i + 1}</p>
        ))}
      </div>
    </div>
  );
}
