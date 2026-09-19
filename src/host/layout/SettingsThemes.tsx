import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { premadePalettes, type Palette, type StatusColor, type NamedPalette } from "../../shared/palette";
import { createModalApi } from "../api/modals";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { TextButton } from "../../components/TextButton/TextButton";
import {
  RESERVED_IDS,
  generatePaletteFromMedia,
  GenerationCancelled,
  type PaletteGeneration,
} from "../api/paletteGenerator";
import binIcon from "../../assets/category-icons/bin.png";
import paletteIcon from "../../assets/category-icons/palette.png";

const modal = createModalApi();

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Cycles through braille spinner frames while `active`, for showing next to
 * a button during a long-running async action. */
function useBrailleSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [active]);
  return BRAILLE_FRAMES[frame];
}

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

function Swatches({ colors }: { colors: Palette }) {
  const swatches: [string, string][] = [
    ["background", colors.background],
    ["text", colors.text],
    ["accent", colors.accent],
    ["border", colors.border],
    ["in-progress", colors.status["in-progress"]],
    ["surface", colors.surface],
  ];
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      {swatches.map(([label, c]) => (
        <span
          key={label}
          title={label}
          style={{ flex: 1, height: 24, borderRadius: 3, background: c, display: "inline-block" }}
        />
      ))}
    </div>
  );
}

export function SettingsThemes() {
  const palette = useAppStore((s) => s.palette);
  const paletteId = useAppStore((s) => s.paletteId);
  const customPalettes = useAppStore((s) => s.customPalettes);
  const hiddenPaletteIds = useAppStore((s) => s.hiddenPaletteIds);
  const setPaletteId = useAppStore((s) => s.setPaletteId);
  const saveCustomPalette = useAppStore((s) => s.saveCustomPalette);
  const deleteCustomPalette = useAppStore((s) => s.deleteCustomPalette);
  const hidePalette = useAppStore((s) => s.hidePalette);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draft, setDraft] = useState<Palette>(palette);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [mediaName, setMediaName] = useState("");
  const [generating, setGenerating] = useState(false);
  const spinnerFrame = useBrailleSpinner(generating);
  const generationRef = useRef<PaletteGeneration | null>(null);

  const overrideMap = new Map(customPalettes.map((c) => [c.id, c] as const));
  const mergedPremade = premadePalettes
    .filter((pp) => overrideMap.has(pp.id) || !hiddenPaletteIds.includes(pp.id))
    .map((pp) => overrideMap.get(pp.id) ?? pp);
  const pureCustom = customPalettes.filter((c) => !premadePalettes.some((pp) => pp.id === c.id));
  const allPalettes = [...mergedPremade, ...pureCustom];

  function startCreate() {
    setDraftName("");
    setDraft(palette);
    setEditingId(null);
    setSaveError(null);
    setCreating(true);
  }

  function startEdit(p: NamedPalette) {
    setEditingId(p.id);
    setDraftName(p.name);
    setDraft(p.colors);
    setSaveError(null);
    setCreating(true);
  }

  function cancelEdit() {
    setCreating(false);
    setEditingId(null);
    setSaveError(null);
  }

  function save() {
    const name = draftName.trim();
    if (!name) return;
    const id = editingId ?? name;
    if (!editingId && RESERVED_IDS.has(id.toLowerCase())) {
      setSaveError(`"${name}" is a reserved name — choose a different one.`);
      return;
    }
    saveCustomPalette({ id, name, colors: draft });
    setCreating(false);
    setEditingId(null);
    setSaveError(null);
  }

  async function handleDelete(p: NamedPalette) {
    const confirmed = await modal.confirm({
      title: "Delete palette",
      message: `Delete the "${p.name}" theme? This can't be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    if (customPalettes.some((c) => c.id === p.id)) deleteCustomPalette(p.id);
    if (premadePalettes.some((pp) => pp.id === p.id)) hidePalette(p.id);
  }

  function startGenerate() {
    setMediaName("");
    setGenerateOpen(true);
  }

  function cancelGenerate() {
    if (generating) {
      generationRef.current?.cancel();
      return;
    }
    setGenerateOpen(false);
    setMediaName("");
  }

  async function handleGenerate() {
    setGenerating(true);
    const gen = generatePaletteFromMedia(mediaName.trim());
    generationRef.current = gen;
    try {
      const p = await gen.promise;
      if (customPalettes.some((c) => c.id === p.id)) {
        const overwrite = await modal.confirm({
          title: "Palette already exists",
          message: `A theme named "${p.name}" already exists. Overwrite it?`,
          confirmLabel: "Overwrite",
          cancelLabel: "Cancel",
        });
        if (!overwrite) return;
      }
      saveCustomPalette(p);
      setGenerateOpen(false);
      setMediaName("");
    } catch (err) {
      if (!(err instanceof GenerationCancelled)) {
        await modal.error({ title: "Generate failed", message: String(err) });
      }
    } finally {
      setGenerating(false);
      generationRef.current = null;
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {allPalettes.map((p) => {
          const immutable = RESERVED_IDS.has(p.id);
          return (
            <div
              key={p.id}
              style={{
                border: `2px solid ${paletteId === p.id ? palette.accent : palette.border}`,
                borderRadius: 8,
                padding: 12,
                minWidth: 220,
              }}
            >
              <button
                onClick={() => setPaletteId(p.id)}
                style={{
                  display: "block",
                  background: "transparent",
                  border: "none",
                  color: palette.text,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  padding: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                {p.name}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {immutable ? (
                  <span style={{ width: 20, flexShrink: 0 }} />
                ) : (
                  <button
                    onClick={() => startEdit(p)}
                    aria-label={`Edit ${p.name}`}
                    title={`Edit ${p.name}`}
                    style={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <MaskIcon png={paletteIcon} alt={`Edit ${p.name}`} size={20} color={palette.textMuted} />
                  </button>
                )}
                <Swatches colors={p.colors} />
                {immutable ? (
                  <span style={{ width: 20, flexShrink: 0 }} />
                ) : (
                  <button
                    onClick={() => handleDelete(p)}
                    aria-label={`Delete ${p.name}`}
                    title={`Delete ${p.name}`}
                    style={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <MaskIcon png={binIcon} alt={`Delete ${p.name}`} size={20} color={palette.status.warning} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!creating && !generateOpen && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <TextButton label="Create New Palette" onClick={startCreate} />
          <TextButton label="Generate New Palette" onClick={startGenerate} />
        </div>
      )}

      {creating && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: palette.textMuted, marginBottom: 6 }}>
            {editingId ? "Edit palette" : "New palette"}
          </div>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Palette name"
            style={{
              background: palette.surface,
              color: palette.text,
              border: `1px solid ${palette.border}`,
              borderRadius: 4,
              padding: "4px 6px",
              marginBottom: 8,
              display: "block",
            }}
          />
          {PALETTE_KEYS.map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 100, fontSize: 12, color: palette.textMuted }}>{key}</span>
              <input
                type="color"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </label>
          ))}
          {STATUS_KEYS.map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 100, fontSize: 12, color: palette.textMuted }}>status.{key}</span>
              <input
                type="color"
                value={draft.status[key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, status: { ...d.status, [key]: e.target.value } }))
                }
              />
            </label>
          ))}
          {saveError && <div style={{ fontSize: 12, color: palette.status.error, marginBottom: 8 }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <TextButton label="Save" onClick={save} disabled={!draftName.trim()} variant="primary" />
            <TextButton label="Cancel" onClick={cancelEdit} />
          </div>
        </div>
      )}

      {generateOpen && (
        <div style={{ marginTop: 16 }}>
          <input
            value={mediaName}
            onChange={(e) => setMediaName(e.target.value)}
            placeholder="Movie, show, or game title"
            disabled={generating}
            style={{
              background: palette.surface,
              color: palette.text,
              border: `1px solid ${palette.border}`,
              borderRadius: 4,
              padding: "4px 6px",
              display: "block",
            }}
          />
          <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 4, marginBottom: 8 }}>
            Enter the name of any movie, show, or game (IP) to generate a theme from its color palette.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TextButton
              label={generating ? "Generating…" : "Generate"}
              onClick={handleGenerate}
              disabled={!mediaName.trim() || generating}
              variant="primary"
            />
            {generating && (
              <span aria-hidden="true" style={{ fontSize: 18, color: palette.accent, alignSelf: "center" }}>
                {spinnerFrame}
              </span>
            )}
            <TextButton label="Cancel" onClick={cancelGenerate} />
          </div>
        </div>
      )}
    </div>
  );
}
