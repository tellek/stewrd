import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import type { CodeTextAreaProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import type { Palette } from "../../shared/palette";

function themeExtension(palette: Palette) {
  return EditorView.theme({
    "&": { color: palette.text, backgroundColor: palette.surface, border: `1px solid ${palette.border}`, borderRadius: "4px" },
    ".cm-content": { caretColor: palette.text },
    ".cm-gutters": { backgroundColor: palette.surface, color: palette.textMuted, border: "none" },
    ".cm-activeLine": { backgroundColor: palette.surfaceHover },
    ".cm-activeLineGutter": { backgroundColor: palette.surfaceHover },
    "&.cm-focused": { outline: `2px solid ${palette.accent}` },
    ".cm-selectionBackground, ::selection": { backgroundColor: `${palette.accent}55` },
  });
}

/** Plugin-facing primitive, exposed via api.ui.CodeTextArea. CodeMirror
 * 6-backed code editor; only `language="json"` is wired today (more language
 * packs can be added to `LANGUAGES` below as needed). Theme colors are pushed
 * through a `Compartment` so switching the app's active palette live-updates
 * the editor without recreating it. */
export function CodeTextArea({ value, onChange, language, height = 200, readOnly }: CodeTextAreaProps) {
  const palette = useAppStore((s) => s.palette);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const extensions = [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      themeCompartment.current.of(themeExtension(palette)),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      ...(language === "json" ? [json()] : []),
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
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(themeExtension(palette)) });
  }, [palette]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} style={{ height, overflow: "auto" }} />;
}
