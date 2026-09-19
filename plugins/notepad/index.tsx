/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useEffect, useMemo, useRef, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
import { Editor, type Palette } from "./editor";
import { ReadingView } from "./ReadingView";
import { Harvester } from "./harvester";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type NotepadSettings } from "./settings";
import {
  createNote,
  deleteNote,
  findBacklinks,
  loadManifest,
  migrateLegacyStorage,
  renameNote,
  resolveWikilink,
  touchNote,
  type Manifest,
  type NoteMeta,
} from "./vault";

type Mode = "source" | "live-preview" | "reading";

let sharedSettings: NotepadSettings = DEFAULT_SETTINGS;

export function activate(ctx: PluginContext) {
  ctx.api.log.info("notepad activated");
  ctx.api.statusIcon.set("idle");

  loadSettings(ctx.api).then((s) => {
    sharedSettings = s;
  });

  const harvester = new Harvester(
    ctx,
    () => sharedSettings.harvesterIntervalMs,
    () => sharedSettings.harvesterEnabled,
  );
  harvester.start();
}

export function deactivate() {
  // Harvester teardown is registered via ctx.onDispose in Harvester.start().
}

export function Component({ api }: { api: PluginApi }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [contentsById, setContentsById] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<Mode>("live-preview");
  const [settings, setSettings] = useState<NotepadSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const palette = api.theme.palette as Palette;

  useEffect(() => {
    (async () => {
      let m = await loadManifest(api);
      m = await migrateLegacyStorage(api, m);
      setManifest(m);
      const s = await loadSettings(api);
      setSettings(s);
      setMode(s.defaultMode);
      sharedSettings = s;
      if (m.notes.length > 0) {
        await openNote(m, m.notes[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openNote(m: Manifest, id: string) {
    const note = m.notes.find((n) => n.id === id);
    if (!note) return;
    let text = "";
    try {
      text = await api.fs.readTextFile(note.path);
    } catch {
      text = "";
    }
    setActiveId(id);
    setContent(text);
    setContentsById((prev) => {
      const next = new Map(prev);
      next.set(id, text);
      return next;
    });
  }

  function onChange(value: string) {
    setContent(value);
    if (!activeId || !manifest) return;
    setContentsById((prev) => {
      const next = new Map(prev);
      next.set(activeId, value);
      return next;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const note = manifest.notes.find((n) => n.id === activeId);
      if (!note) return;
      try {
        await api.fs.writeTextFile(note.path, value);
        await touchNote(api, manifest, activeId);
        api.statusIcon.set("success", "saved");
      } catch {
        api.statusIcon.set("error", "save failed");
      }
    }, settings.autosaveDebounceMs);
  }

  async function handleNewNote() {
    if (!manifest) return;
    const title = window.prompt("Note title?", "Untitled");
    if (title === null) return;
    const note = await createNote(api, manifest, title);
    setManifest({ ...manifest });
    await openNote(manifest, note.id);
  }

  async function handleClear() {
    if (!activeId) return;
    onChange("");
  }

  async function handleShiftToHarvest() {
    if (!activeId || !content.trim() || !manifest) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await api.fs.writeTextFile(`harvest/note-${timestamp}.md`, content);
    onChange("");
    api.toast.show({ message: "Moved to harvest folder", kind: "success" });
  }

  async function handleWikilinkClick(target: string) {
    if (!manifest) return;
    const note = resolveWikilink(manifest, target);
    if (note) {
      await openNote(manifest, note.id);
    } else {
      const created = await createNote(api, manifest, target);
      setManifest({ ...manifest });
      await openNote(manifest, created.id);
    }
  }

  async function handleDeleteNote(id: string) {
    if (!manifest) return;
    if (!window.confirm("Delete this note?")) return;
    await deleteNote(api, manifest, id);
    setManifest({ ...manifest });
    if (activeId === id) {
      setActiveId(null);
      setContent("");
      if (manifest.notes[0]) await openNote(manifest, manifest.notes[0].id);
    }
  }

  async function handleRename(id: string) {
    if (!manifest) return;
    const note = manifest.notes.find((n) => n.id === id);
    if (!note) return;
    const title = window.prompt("Rename note", note.title);
    if (!title || title === note.title) return;
    await renameNote(api, manifest, id, title);
    setManifest({ ...manifest });
  }

  async function updateSettings(patch: Partial<NotepadSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    sharedSettings = next;
    await saveSettings(api, next);
  }

  const activeNote = manifest?.notes.find((n) => n.id === activeId) ?? null;
  const backlinks = useMemo(() => {
    if (!manifest || !activeNote) return [];
    return findBacklinks(manifest, activeNote.title, contentsById).filter((n) => n.id !== activeNote.id);
  }, [manifest, activeNote, contentsById]);

  if (!manifest) return <p>Loading...</p>;

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ width: 180, flexShrink: 0 }}>
        <api.ui.TextButton label="New Note" onClick={handleNewNote} />
        <ul style={{ listStyle: "none", padding: 0 }}>
          {manifest.notes.map((n) => (
            <li key={n.id} style={{ display: "flex", justifyContent: "space-between" }}>
              <a href="#" onClick={(e) => { e.preventDefault(); openNote(manifest, n.id); }} style={{ fontWeight: n.id === activeId ? "bold" : "normal" }}>
                {n.title}
              </a>
              <span>
                <button onClick={() => handleRename(n.id)}>✎</button>
                <button onClick={() => handleDeleteNote(n.id)}>🗑</button>
              </span>
            </li>
          ))}
        </ul>
        <api.ui.TextButton label="Settings" onClick={() => setShowSettings((s) => !s)} />
        {showSettings && (
          <div>
            <label>
              Default mode:
              <select value={settings.defaultMode} onChange={(e) => updateSettings({ defaultMode: e.target.value as Mode })}>
                <option value="source">Source</option>
                <option value="live-preview">Live Preview</option>
                <option value="reading">Reading</option>
              </select>
            </label>
            <api.ui.Toggle
              checked={settings.harvesterEnabled}
              onChange={(checked) => updateSettings({ harvesterEnabled: checked })}
              label="Enable LLM-wiki harvester"
            />
            <label>
              Harvester interval (minutes):
              <input
                type="number"
                min={1}
                value={Math.round(settings.harvesterIntervalMs / 60000)}
                onChange={(e) => updateSettings({ harvesterIntervalMs: Math.max(1, Number(e.target.value)) * 60000 })}
              />
            </label>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>{activeNote?.title ?? "Notepad"}</h2>
        {activeNote && (
          <>
            <api.ui.Tabs
              tabs={[
                { label: "Source", value: "source" },
                { label: "Live Preview", value: "live-preview" },
                { label: "Reading", value: "reading" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />
            <p>
              <button onClick={handleClear} disabled={!content.trim()}>
                Clear
              </button>{" "}
              <button onClick={handleShiftToHarvest} disabled={!content.trim()}>
                Shift to harvest
              </button>
            </p>
            {mode === "reading" ? (
              <ReadingView content={content} manifest={manifest} onWikilinkClick={handleWikilinkClick} />
            ) : (
              <Editor value={content} onChange={onChange} mode={mode === "live-preview" ? "live-preview" : "source"} palette={palette} />
            )}
            {backlinks.length > 0 && (
              <div>
                <h3>Backlinks</h3>
                <ul>
                  {backlinks.map((n) => (
                    <li key={n.id}>
                      <a href="#" onClick={(e) => { e.preventDefault(); openNote(manifest, n.id); }}>
                        {n.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {!activeNote && <p>Create a note to get started.</p>}
      </div>
    </div>
  );
}
