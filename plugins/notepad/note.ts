// A single always-present, unnamed note stored as one .md file under this
// plugin's own sandboxed storage folder.
import type { PluginApi } from "stewrd-plugin-api";

const NOTE_PATH = "note.md";
const LEGACY_STORAGE_KEY = "content";

export async function loadNote(api: PluginApi): Promise<string> {
  try {
    return await api.fs.readTextFile(NOTE_PATH);
  } catch {
    // No note.md yet - migrate the old single-note api.storage blob if present,
    // then create the file so the read error doesn't recur.
    const legacy = await api.storage.get<string>(LEGACY_STORAGE_KEY);
    const content = legacy ?? "";
    await api.fs.writeTextFile(NOTE_PATH, content);
    return content;
  }
}

export async function saveNote(api: PluginApi, content: string): Promise<void> {
  await api.fs.writeTextFile(NOTE_PATH, content);
}
