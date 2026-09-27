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

type ViewportSnapshot = { selection: { anchor: number; head: number }; scrollTop: number };

/** Clamps a saved anchor/head against the *live* document length - never
 * against the raw `value` string length, since CodeMirror normalizes
 * "\r\n" to a single line break so `doc.length` can be shorter than
 * `value.length` for CRLF content. */
function clampSelection(sel: { anchor: number; head: number }, docLength: number): { anchor: number; head: number } {
  const clamp = (n: number) => Math.max(0, Math.min(n, docLength));
  return { anchor: clamp(sel.anchor), head: clamp(sel.head) };
}

const VIEWPORT_DEBOUNCE_MS = 400;

/** Plugin-facing primitive, exposed via api.ui.CodeTextArea. CodeMirror
 * 6-backed code editor; `language="json"` and `language="markdown"` are wired
 * today (more language packs can be added as needed). Theme/highlight colors
 * are pushed through `Compartment`s so switching the app's active palette
 * live-updates the editor without recreating it. `width`/`height` are fixed
 * (not content-driven) with line-wrapping on, matching a normal textarea.
 * `initialSelection`/`initialScrollTop` restore a saved cursor/scroll
 * position once (the first time there's content to place it in) and
 * `onViewportChange` reports further user-driven changes, debounced. */
export function CodeTextArea({
  value,
  onChange,
  language,
  width = "100%",
  height = 200,
  readOnly,
  initialSelection,
  initialScrollTop,
  onViewportChange,
}: CodeTextAreaProps) {
  const palette = useAppStore((s) => s.palette);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const initialSelectionRef = useRef(initialSelection);
  initialSelectionRef.current = initialSelection;
  const initialScrollTopRef = useRef(initialScrollTop);
  initialScrollTopRef.current = initialScrollTop;

  // Whether the initial selection/scroll have been applied yet (they apply
  // once, the first time there's non-empty content to place them in).
  const appliedInitialRef = useRef(false);
  // Last-known user viewport (selection + scroll), kept live so a
  // readOnly-only rebuild (see the mount effect's deps) can restore it -
  // seeded both by the initial apply and by real user changes below.
  const lastKnownRef = useRef<ViewportSnapshot | null>(null);
  // Tracks the previous `language` so a rebuild caused by a `language`
  // change (different/reset content) doesn't reapply a stale position -
  // only a readOnly-only rebuild does.
  const prevLanguageRef = useRef(language);
  // Suppresses the next onViewportChange emission caused by this
  // component's own programmatic selection/scroll dispatch, not a real
  // user action.
  const suppressNextSelectionEmitRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<ViewportSnapshot | null>(null);

  function scheduleViewportEmit(snapshot: ViewportSnapshot) {
    pendingSnapshotRef.current = snapshot;
    lastKnownRef.current = snapshot;
    if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (pendingSnapshotRef.current) onViewportChangeRef.current?.(pendingSnapshotRef.current);
    }, VIEWPORT_DEBOUNCE_MS);
  }

  /** Applies a saved selection/scroll to `view` once, clamped against the
   * view's live doc length, and marks it applied. Scroll is deferred past
   * CodeMirror's first measure pass (requestMeasure's `write`) since line
   * heights are only estimated until then, especially with line-wrapping. */
  function applyInitialViewport(view: EditorView, selection?: { anchor: number; head: number }, scrollTop?: number) {
    if (selection) {
      const clamped = clampSelection(selection, view.state.doc.length);
      suppressNextSelectionEmitRef.current = true;
      view.dispatch({ selection: clamped });
      lastKnownRef.current = { ...(lastKnownRef.current ?? { selection: clamped, scrollTop: 0 }), selection: clamped };
    }
    if (scrollTop != null) {
      view.requestMeasure({
        read: () => {},
        write: () => {
          view.scrollDOM.scrollTop = scrollTop;
          lastKnownRef.current = {
            selection: lastKnownRef.current?.selection ?? { anchor: 0, head: 0 },
            scrollTop,
          };
        },
      });
    }
    appliedInitialRef.current = true;
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const isLanguageRebuild = prevLanguageRef.current !== language;
    prevLanguageRef.current = language;

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
        if (update.selectionSet) {
          if (suppressNextSelectionEmitRef.current) {
            suppressNextSelectionEmitRef.current = false;
            return;
          }
          const { anchor, head } = update.state.selection.main;
          scheduleViewportEmit({
            selection: { anchor, head },
            scrollTop: update.view.scrollDOM.scrollTop,
          });
        }
      }),
      ...(language === "json" ? [json()] : language === "markdown" ? [markdown()] : []),
    ];

    // Only apply the initial selection up front if there's already content
    // to place it in - otherwise the async `value`-sync effect below applies
    // it once real content arrives, to avoid an out-of-range selection.
    const hasInitialContent = value.length > 0;
    const upfrontSelection =
      hasInitialContent && initialSelectionRef.current
        ? clampSelection(initialSelectionRef.current, value.length)
        : undefined;

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions, selection: upfrontSelection }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    const onScroll = () => {
      if (suppressNextSelectionEmitRef.current) return;
      const { anchor, head } = view.state.selection.main;
      scheduleViewportEmit({ selection: { anchor, head }, scrollTop: view.scrollDOM.scrollTop });
    };
    view.scrollDOM.addEventListener("scroll", onScroll);

    if (hasInitialContent && !appliedInitialRef.current) {
      applyInitialViewport(view, upfrontSelection, initialScrollTopRef.current);
    } else if (!isLanguageRebuild && lastKnownRef.current) {
      // readOnly-only rebuild (language unchanged): restore the last-known
      // user viewport instead of resetting to the top.
      applyInitialViewport(view, lastKnownRef.current.selection, lastKnownRef.current.scrollTop);
    }

    return () => {
      view.scrollDOM.removeEventListener("scroll", onScroll);
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
      view.destroy();
    };
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
    if (!appliedInitialRef.current && value.length > 0) {
      applyInitialViewport(view, initialSelectionRef.current, initialScrollTopRef.current);
    }
  }, [value]);

  return <div ref={containerRef} style={{ width, height, overflow: "hidden" }} />;
}
