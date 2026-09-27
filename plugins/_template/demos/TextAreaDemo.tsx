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
  const [md, setMd] = useState("# Heading\n\nSome **bold** and _italic_ text, a `code span`, and a [link](https://example.com).");

  return (
    <div>
      <p>JSON editor, fixed 400x200 with word-wrap, syntax colors follow the active palette live:</p>
      <api.ui.CodeTextArea value={code} onChange={setCode} language="json" width={400} height={200} />

      <p>Markdown editor, same size but with a percentage height to show `height` also accepts a string:</p>
      <api.ui.CodeTextArea value={md} onChange={setMd} language="markdown" width={400} height={200} />

      <p>
        Seeded with `initialSelection`/`initialScrollTop` (applied once) and reporting cursor/scroll
        via `onViewportChange` (debounced, logged below):
      </p>
      <api.ui.CodeTextArea
        value={code}
        onChange={setCode}
        language="json"
        width={400}
        height={200}
        initialSelection={{ anchor: 2, head: 2 }}
        initialScrollTop={0}
        onViewportChange={(state) => api.log.info(`viewport: ${JSON.stringify(state)}`)}
      />

      <p>Palette-colored scrollbar on a plain scrollable div (see `scrollbarStyle` above):</p>
      <div style={{ ...scrollbarStyle(api.theme.palette), height: 100, overflow: "auto", border: `1px solid ${api.theme.palette.border}` }}>
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i}>Line {i + 1}</p>
        ))}
      </div>
    </div>
  );
}
