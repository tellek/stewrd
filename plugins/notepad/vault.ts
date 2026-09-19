// Plugin-maintained "vault" of notes, backed by individual .md files under
// this plugin's own sandboxed storage folder (see api.fs). There is no
// directory-listing-free way to discover notes a user might place there by
// hand, so this plugin is the sole writer of everything under notes/ and
// tracks every note it creates in a manifest (index.json) - that manifest,
// not a filesystem scan, is the source of truth for the note list,
// wikilink resolution, and backlinks.
import type { PluginApi } from "stewrd-plugin-api";

export interface NoteMeta {
  id: string;
  title: string;
  path: string; // relative to the plugin's fs root, e.g. "notes/my-note.md"
  createdAt: number;
  updatedAt: number;
}

export interface Manifest {
  notes: NoteMeta[];
}

const MANIFEST_PATH = "index.json";
const LEGACY_STORAGE_KEY = "content";

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

export async function loadManifest(api: PluginApi): Promise<Manifest> {
  try {
    const raw = await api.fs.readTextFile(MANIFEST_PATH);
    const parsed = JSON.parse(raw) as Manifest;
    if (Array.isArray(parsed.notes)) return parsed;
  } catch {
    // No manifest yet (first run, or file missing) - fall through.
  }
  return { notes: [] };
}

async function saveManifest(api: PluginApi, manifest: Manifest): Promise<void> {
  await api.fs.writeTextFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/** Ensures every note title maps to a unique file path within notes/. */
function uniquePath(manifest: Manifest, title: string, excludeId?: string): string {
  const base = slugify(title);
  let candidate = `notes/${base}.md`;
  let n = 2;
  while (manifest.notes.some((note) => note.path === candidate && note.id !== excludeId)) {
    candidate = `notes/${base}-${n}.md`;
    n += 1;
  }
  return candidate;
}

export async function createNote(api: PluginApi, manifest: Manifest, title: string, content = ""): Promise<NoteMeta> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = uniquePath(manifest, title || "Untitled");
  const now = Date.now();
  const meta: NoteMeta = { id, title: title || "Untitled", path, createdAt: now, updatedAt: now };
  await api.fs.writeTextFile(path, content);
  manifest.notes.push(meta);
  await saveManifest(api, manifest);
  return meta;
}

export async function renameNote(api: PluginApi, manifest: Manifest, id: string, newTitle: string): Promise<void> {
  const note = manifest.notes.find((n) => n.id === id);
  if (!note) return;
  const newPath = uniquePath(manifest, newTitle, id);
  if (newPath !== note.path) {
    await api.fs.renameFile(note.path, newPath);
    note.path = newPath;
  }
  note.title = newTitle;
  note.updatedAt = Date.now();
  await saveManifest(api, manifest);
}

export async function deleteNote(api: PluginApi, manifest: Manifest, id: string): Promise<void> {
  const idx = manifest.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const [note] = manifest.notes.splice(idx, 1);
  try {
    await api.fs.deleteFile(note.path);
  } catch {
    // Already gone on disk - manifest is still the source of truth we fix up.
  }
  await saveManifest(api, manifest);
}

export async function touchNote(api: PluginApi, manifest: Manifest, id: string): Promise<void> {
  const note = manifest.notes.find((n) => n.id === id);
  if (!note) return;
  note.updatedAt = Date.now();
  await saveManifest(api, manifest);
}

/** One-time migration from the old single-note api.storage blob. */
export async function migrateLegacyStorage(api: PluginApi, manifest: Manifest): Promise<Manifest> {
  if (manifest.notes.length > 0) return manifest;
  const legacy = await api.storage.get<string>(LEGACY_STORAGE_KEY);
  if (!legacy || !legacy.trim()) return manifest;
  await createNote(api, manifest, "Untitled", legacy);
  return manifest;
}

/** Resolves a `[[Wikilink]]` target to the note it refers to, if any. */
export function resolveWikilink(manifest: Manifest, target: string): NoteMeta | undefined {
  const normalized = target.trim().toLowerCase();
  return manifest.notes.find((n) => n.title.trim().toLowerCase() === normalized);
}

/** Every note that contains a `[[title]]` wikilink pointing at `noteTitle`. */
export function findBacklinks(manifest: Manifest, noteTitle: string, contentsById: Map<string, string>): NoteMeta[] {
  const target = noteTitle.trim().toLowerCase();
  const wikilinkRe = /\[\[([^\]|#^]+)/g;
  return manifest.notes.filter((note) => {
    const content = contentsById.get(note.id);
    if (!content) return false;
    let match: RegExpExecArray | null;
    wikilinkRe.lastIndex = 0;
    while ((match = wikilinkRe.exec(content))) {
      if (match[1].trim().toLowerCase() === target) return true;
    }
    return false;
  });
}
