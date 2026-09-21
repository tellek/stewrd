import { describe, expect, it, vi } from "vitest";
import { slugify, safeId, generatePaletteFromMedia, GenerationCancelled, parsePaletteJson } from "./paletteGenerator";

vi.mock("@tauri-apps/api/path", () => ({ tempDir: vi.fn().mockResolvedValue("/tmp") }));

const mockRunHeadlessAi = vi.fn();
vi.mock("./ai", () => ({ runHeadlessAi: (...args: unknown[]) => mockRunHeadlessAi(...args) }));

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Cool Theme Name")).toBe("cool-theme-name");
  });

  it("trims and collapses non-alphanumeric runs", () => {
    expect(slugify("  Foo!!Bar--Baz  ")).toBe("foo-bar-baz");
  });

  it("falls back to theme for an empty/all-symbol input", () => {
    expect(slugify("")).toBe("theme");
    expect(slugify("!!!")).toBe("theme");
  });
});

describe("safeId", () => {
  it("suffixes an id that collides with a reserved id", () => {
    expect(safeId("dark")).toBe("dark-theme");
    expect(safeId("Light")).toBe("Light-theme");
  });

  it("passes through a non-colliding id unchanged", () => {
    expect(safeId("phantom")).toBe("phantom");
  });
});

function validColors() {
  return {
    background: "#000",
    surface: "#111",
    surfaceHover: "#222",
    text: "#fff",
    textMuted: "#ccc",
    border: "#333",
    accent: "#00a3ff",
    status: {
      idle: "#1",
      "in-progress": "#2",
      success: "#3",
      warning: "#4",
      error: "#5",
    },
  };
}

describe("parsePaletteJson", () => {
  it("extracts valid JSON embedded in extra surrounding text", () => {
    const stdout = `here you go\n${JSON.stringify({ name: "Test Theme", colors: validColors() })}\nthanks`;
    const result = parsePaletteJson(stdout);
    expect(result.name).toBe("Test Theme");
    expect(result.colors.accent).toBe("#00a3ff");
  });

  it("throws when the response is missing an opening or closing brace", () => {
    expect(() => parsePaletteJson("no braces here")).toThrow("Couldn't parse a palette from the response");
    expect(() => parsePaletteJson("{ unterminated")).toThrow("Couldn't parse a palette from the response");
  });

  it("throws when the content between braces isn't valid JSON", () => {
    expect(() => parsePaletteJson("{not json}")).toThrow("Couldn't parse a palette from the response");
  });

  it("throws when the parsed value isn't an object", () => {
    expect(() => parsePaletteJson("[1, 2, 3]")).toThrow("Couldn't parse a palette from the response");
  });

  it("throws when the theme name is missing or empty", () => {
    expect(() => parsePaletteJson(JSON.stringify({ colors: validColors() }))).toThrow(
      "Response didn't include a theme name",
    );
    expect(() => parsePaletteJson(JSON.stringify({ name: "   ", colors: validColors() }))).toThrow(
      "Response didn't include a theme name",
    );
  });

  it("throws when colors is missing", () => {
    expect(() => parsePaletteJson(JSON.stringify({ name: "Test" }))).toThrow("Response didn't include theme colors");
  });

  it("throws when a Palette color key is missing", () => {
    const colors = validColors();
    delete (colors as Record<string, unknown>).accent;
    expect(() => parsePaletteJson(JSON.stringify({ name: "Test", colors }))).toThrow(
      'Response is missing color "accent"',
    );
  });

  it("throws when status is missing", () => {
    const colors = validColors() as Record<string, unknown>;
    delete colors.status;
    expect(() => parsePaletteJson(JSON.stringify({ name: "Test", colors }))).toThrow(
      'Response is missing "status" colors',
    );
  });

  it("throws when a status key is missing", () => {
    const colors = validColors();
    delete (colors.status as Record<string, unknown>).warning;
    expect(() => parsePaletteJson(JSON.stringify({ name: "Test", colors }))).toThrow(
      'Response is missing status color "warning"',
    );
  });
});

function makeHandle() {
  let resolveDone!: (v: string) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<string>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // Mimic the real CLI process: killing it causes `done` to reject, since
  // that's what actually unblocks the cancel/timeout promise chains below.
  const kill = vi.fn(() => rejectDone(new Error("killed")));
  return { handle: { pid: 1, kill, done }, kill, resolveDone, rejectDone };
}

describe("generatePaletteFromMedia", () => {
  it("rejects with GenerationCancelled and kills the process when cancelled before completion", async () => {
    const { handle, kill } = makeHandle();
    mockRunHeadlessAi.mockReturnValue(handle);

    const generation = generatePaletteFromMedia("Some Movie");
    generation.cancel();

    await expect(generation.promise).rejects.toBeInstanceOf(GenerationCancelled);
    expect(mockRunHeadlessAi).toHaveBeenCalled();
    expect(kill).toHaveBeenCalled();
  });

  it("rejects with a timeout message and kills the process after 120s without a response", async () => {
    vi.useFakeTimers();
    try {
      const { handle, kill } = makeHandle();
      mockRunHeadlessAi.mockReturnValue(handle);

      const generation = generatePaletteFromMedia("Some Movie");
      // Let the tempDir().then(...) microtask run so runHeadlessAi is invoked.
      await vi.advanceTimersByTimeAsync(0);

      const assertion = expect(generation.promise).rejects.toThrow("Timed out waiting for a response (2 min).");
      await vi.advanceTimersByTimeAsync(120_000);
      await assertion;

      expect(mockRunHeadlessAi).toHaveBeenCalled();
      expect(kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
