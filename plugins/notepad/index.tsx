/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useEffect, useRef, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
import { Editor, type Palette } from "./editor";
import { ReadingView } from "./ReadingView";
import { Harvester } from "./harvester";
import { loadNote, saveNote } from "./note";
import { DEFAULT_SETTINGS, loadSettings, type NotepadSettings } from "./settings";

type Mode = "source" | "live-preview" | "reading";

// This plugin's own id - matches plugin.json's "id" (and this folder's name).
// Component only receives `api`, not `ctx`, so there's no PluginContext to
// pull pluginId from here; it's a constant since this file only ever is notepad.
const PLUGIN_ID = "notepad";

export function activate(ctx: PluginContext) {
  ctx.api.log.info("notepad activated");
  ctx.api.statusIcon.set("idle");
  new Harvester(ctx).start();
}

export function deactivate() {
  // Harvester teardown is registered via ctx.onDispose in Harvester.start().
}

function toggleChecklistAt(content: string, index: number): string {
  const re = /^(\s*(?:[-*+]|\d+\.)\s\[)([ xX])(\])/gm;
  let count = -1;
  return content.replace(re, (match, before, mark, after) => {
    count += 1;
    if (count !== index) return match;
    return `${before}${mark.toLowerCase() === "x" ? " " : "x"}${after}`;
  });
}

type SaveState = "idle" | "warning" | "success" | "error";

export function Component({ api }: { api: PluginApi }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>(DEFAULT_SETTINGS.defaultMode);
  const [settings, setSettings] = useState<NotepadSettings>(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contentRef = useRef("");
  const palette = api.theme.palette as Palette;

  useEffect(() => {
    (async () => {
      const [text, s] = await Promise.all([loadNote(api), loadSettings(PLUGIN_ID)]);
      setContent(text);
      contentRef.current = text;
      setSettings(s);
      setMode(s.defaultMode);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flushSave(value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    // Autosave is routine/frequent - leave the sidebar status dot uncolored
    // ("idle") on a normal save instead of pinning it green forever; only a
    // real failure is worth calling out with color.
    // The editor pads itself with trailing blank lines to allow scrolling
    // past the end of the note (see editor.tsx's infiniteScroll) - trim
    // those back out before they ever touch disk. The live buffer/cursor/
    // scroll position are untouched; only the saved copy is trimmed.
    saveNote(api, value.trimEnd())
      .then(() => {
        setSaveState("success");
        api.statusIcon.set("idle");
      })
      .catch(() => {
        setSaveState("error");
        api.statusIcon.set("error", "save failed");
      });
  }

  // Save 1s after typing stops, independent of the editor keeping focus -
  // the timer lives here (not tied to any DOM focus state) so it fires
  // regardless of what else has focus by the time it goes off.
  function onChange(value: string) {
    setContent(value);
    contentRef.current = value;
    setSaveState("warning"); // unsaved changes pending
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushSave(value), settings.autosaveDebounceMs);
  }

  // If the plugin's view unmounts (switching to another sidebar item) with a
  // pending autosave, flush immediately instead of losing/delaying it.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveNote(api, contentRef.current.trimEnd()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClear() {
    onChange("");
  }

  async function handleShift() {
    if (!content.trim()) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await api.fs.writeTextFile(`harvest/note-${timestamp}.md`, content.trimEnd());
    onChange("");
    api.toast.show({ message: "Moved to harvest folder", kind: "success" });
  }

  function handleChecklistToggle(index: number) {
    onChange(toggleChecklistAt(content, index));
  }

  if (!loaded) return <p>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <api.ui.Tabs
          tabs={[
            { label: "Source", value: "source" },
            { label: "Live Preview", value: "live-preview" },
            { label: "Reading", value: "reading" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <api.ui.StatusDot color={saveState} />
          <api.ui.TextButton label="Clear" onClick={handleClear} disabled={!content.trim()} variant="secondary" />
          <api.ui.TextButton label="Shift" onClick={handleShift} disabled={!content.trim()} variant="secondary" />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", marginTop: 8 }}>
        {mode === "reading" ? (
          <ReadingView content={content} palette={palette} onChecklistToggle={handleChecklistToggle} />
        ) : (
          <Editor value={content} onChange={onChange} mode={mode === "live-preview" ? "live-preview" : "source"} palette={palette} />
        )}
      </div>
    </div>
  );
}
