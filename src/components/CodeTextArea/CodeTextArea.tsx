import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { CodeTextAreaProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import type { Palette } from "../../shared/palette";

function themeExtension(palette: Palette) {
  return EditorView.theme({
    "&": { color: palette.text, backgroundColor: palette.surface, borderRadius: "4px", height: "100%", width: "100%" },
    "&.cm-editor": { border: `1px solid ${palette.border}`, outline: "none" },
    "&.cm-editor.cm-focused": { outline: "none", border: `1px solid ${palette.accent}`, boxShadow: `0 0 0 1px ${palette.accent}` },
    ".cm-content": { caretColor: palette.text },
    // Palette-driven thin scrollbar, matching plugins/_template's
    // scrollbarStyle() helper - CodeMirror's own scroller is a plain
    // overflow:auto div and otherwise falls back to the browser default.
    ".cm-scroller": {
      overflow: "auto",
      height: "100%",
      scrollbarWidth: "thin",
      scrollbarColor: `${palette.border} ${palette.surface}`,
    },
    ".cm-gutters": { backgroundColor: palette.surface, color: palette.textMuted, border: "none" },
    ".cm-activeLine": { backgroundColor: palette.surfaceHover },
    ".cm-activeLineGutter": { backgroundColor: palette.surfaceHover },
    ".cm-selectionBackground, ::selection": { backgroundColor: `${palette.accent}55` },
  });
}

/** Syntax colors derived from palette tokens only (status colors + accent +
 * textMuted), never literal hex - keeps highlighting on-theme across every
 * palette instead of a fixed color scheme. */
function highlightExtension(palette: Palette) {
  const style = HighlightStyle.define([
    { tag: tags.string, color: palette.status.success },
    { tag: tags.number, color: palette.status.warning },
    { tag: tags.bool, color: palette.status.warning },
    { tag: tags.null, color: palette.status.warning },
    { tag: tags.propertyName, color: palette.accent },
    { tag: tags.punctuation, color: palette.textMuted },
    { tag: tags.comment, color: palette.textMuted, fontStyle: "italic" },
    { tag: tags.invalid, color: palette.status.error },
    { tag: tags.heading, color: palette.accent, fontWeight: "bold" },
    { tag: tags.strong, color: palette.accent, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.link, color: palette.accent },
    { tag: tags.url, color: palette.accent },
    { tag: tags.monospace, color: palette.status.success },
    { tag: tags.quote, color: palette.textMuted, fontStyle: "italic" },
    { tag: tags.processingInstruction, color: palette.textMuted },
  ]);
  return syntaxHighlighting(style);
}

/** Plugin-facing primitive, exposed via api.ui.CodeTextArea. CodeMirror
 * 6-backed code editor; `language="json"` and `language="markdown"` are wired
 * today (more language packs can be added as needed). Theme/highlight colors
 * are pushed through `Compartment`s so switching the app's active palette
 * live-updates the editor without recreating it. `width`/`height` are fixed
 * (not content-driven) with line-wrapping on, matching a normal textarea. */
export function CodeTextArea({ value, onChange, language, width = "100%", height = 200, readOnly }: CodeTextAreaProps) {
  const palette = useAppStore((s) => s.palette);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const extensions = [
      lineNumbers(),
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      themeCompartment.current.of(themeExtension(palette)),
      highlightCompartment.current.of(highlightExtension(palette)),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      ...(language === "json" ? [json()] : language === "markdown" ? [markdown()] : []),
    ];
    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        themeCompartment.current.reconfigure(themeExtension(palette)),
        highlightCompartment.current.reconfigure(highlightExtension(palette)),
      ],
    });
  }, [palette]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} style={{ width, height, overflow: "hidden" }} />;
}
