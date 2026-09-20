import { tempDir } from "@tauri-apps/api/path";
import { runHeadlessAi } from "./ai";
import type { NamedPalette, Palette, StatusColor } from "../../shared/palette";

/** Ids owned by the built-in, immutable Dark/Light themes - a generated or
 * hand-created palette must never collide with these (resolvePalette in
 * appStore.ts looks up customPalettes before premadePalettes by id, so a
 * collision would silently hijack Dark/Light's colors everywhere). */
export const RESERVED_IDS = new Set(["dark", "light"]);

const PALETTE_KEYS: (keyof Omit<Palette, "status">)[] = [
  "background",
  "surface",
  "surfaceHover",
  "text",
  "textMuted",
  "border",
  "accent",
];

const STATUS_KEYS: StatusColor[] = ["idle", "in-progress", "success", "warning", "error"];

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "theme";
}

export function safeId(id: string): string {
  return RESERVED_IDS.has(id.toLowerCase()) ? `${id}-theme` : id;
}

function buildPrompt(mediaName: string): string {
  return `Research the dominant color palette of the movie/show/game "${mediaName}" (use web search). If no documented color palette exists, find a representative promotional image and infer its dominant colors instead.

Output ONLY a raw JSON object - no markdown fences, no commentary, nothing else - shaped exactly like this:
{"name": "<a short theme name inspired by this media's setting or lore, NOT the media's own title>", "colors": {"background": "#hex", "surface": "#hex", "surfaceHover": "#hex", "text": "#hex", "textMuted": "#hex", "border": "#hex", "accent": "#hex", "status": {"idle": "#hex", "in-progress": "#hex", "success": "#hex", "warning": "#hex", "error": "#hex"}}}

This is for a dark-mode-first developer tool UI theme: background should be dark, text should be light, with WCAG-AA-ish contrast. accent and the status colors should be tinted toward the media's dominant colors while status.success/warning/error still read as green/yellow/red-ish.`;
}

function parsePaletteJson(stdout: string): { name: string; colors: Palette } {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Couldn't parse a palette from the response");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new Error("Couldn't parse a palette from the response");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Couldn't parse a palette from the response");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error("Response didn't include a theme name");
  }
  const colors = obj.colors as Record<string, unknown> | undefined;
  if (!colors) throw new Error("Response didn't include theme colors");
  for (const key of PALETTE_KEYS) {
    if (typeof colors[key] !== "string") throw new Error(`Response is missing color "${key}"`);
  }
  const status = colors.status as Record<string, unknown> | undefined;
  if (!status) throw new Error('Response is missing "status" colors');
  for (const key of STATUS_KEYS) {
    if (typeof status[key] !== "string") throw new Error(`Response is missing status color "${key}"`);
  }
  return { name: obj.name.trim(), colors: colors as unknown as Palette };
}

export interface PaletteGeneration {
  promise: Promise<NamedPalette>;
  cancel(): void;
}

export class GenerationCancelled extends Error {}

/** Shells out to the `claude` CLI headlessly (WebSearch/WebFetch only, no
 * file/shell tools) via runHeadlessAi to research a movie/show/game's
 * dominant colors and turn them into a NamedPalette. Returns a cancellable,
 * timed-out-after-2-minutes handle rather than a bare promise, since this is
 * a long-running external process that the UI needs to be able to kill. */
export function generatePaletteFromMedia(mediaName: string): PaletteGeneration {
  let outcome: "cancelled" | "timeout" | null = null;

  const handlePromise = tempDir().then((cwd) =>
    runHeadlessAi(buildPrompt(mediaName), {
      model: "sonnet",
      allowedTools: ["WebSearch", "WebFetch"],
      disallowedTools: ["Bash", "Write", "Edit", "Read"],
      cwd,
    }),
  );

  const timeoutId = setTimeout(() => {
    outcome = "timeout";
    void handlePromise.then((h) => h.kill());
  }, 120_000);

  const promise = handlePromise
    .then((h) => h.done)
    .then((stdout) => {
      clearTimeout(timeoutId);
      if (outcome === "cancelled") throw new GenerationCancelled();
      if (outcome === "timeout") throw new Error("Timed out waiting for a response (2 min).");
      const parsed = parsePaletteJson(stdout);
      return { id: safeId(slugify(parsed.name)), name: parsed.name, colors: parsed.colors };
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (outcome === "cancelled") throw new GenerationCancelled();
      if (outcome === "timeout") throw new Error("Timed out waiting for a response (2 min).");
      if (err instanceof GenerationCancelled) throw err;
      throw err;
    });

  return {
    promise,
    cancel: () => {
      outcome = "cancelled";
      clearTimeout(timeoutId);
      void handlePromise.then((h) => h.kill());
    },
  };
}
