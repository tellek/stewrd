import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { premadePalettes, type Palette, type StatusColor } from "../../shared/palette";

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
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[colors.background, colors.surface, colors.accent, colors.status.error].map((c, i) => (
        <span key={i} style={{ width: 14, height: 14, background: c, display: "inline-block" }} />
      ))}
    </div>
  );
}

export function SettingsThemes() {
  const palette = useAppStore((s) => s.palette);
  const paletteId = useAppStore((s) => s.paletteId);
  const customPalettes = useAppStore((s) => s.customPalettes);
  const setPaletteId = useAppStore((s) => s.setPaletteId);
  const saveCustomPalette = useAppStore((s) => s.saveCustomPalette);
  const deleteCustomPalette = useAppStore((s) => s.deleteCustomPalette);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draft, setDraft] = useState<Palette>(palette);

  const allPalettes = [...premadePalettes, ...customPalettes];

  function startCreate() {
    setDraftName("");
    setDraft(palette);
    setCreating(true);
  }

  function save() {
    if (!draftName.trim()) return;
    saveCustomPalette({ id: draftName.trim(), name: draftName.trim(), colors: draft });
    setCreating(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {allPalettes.map((p) => {
          const isCustom = customPalettes.some((c) => c.id === p.id);
          return (
            <div
              key={p.id}
              style={{
                border: `2px solid ${paletteId === p.id ? palette.accent : palette.border}`,
                borderRadius: 6,
                padding: 10,
                minWidth: 120,
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
                }}
              >
                <Swatches colors={p.colors} />
                <span>{p.name}</span>
              </button>
              {isCustom && (
                <button onClick={() => deleteCustomPalette(p.id)} style={{ fontSize: 11, cursor: "pointer" }}>
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!creating ? (
        <button onClick={startCreate} style={{ marginTop: 16, cursor: "pointer" }}>
          Create new palette
        </button>
      ) : (
        <div style={{ marginTop: 16 }}>
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
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={save} disabled={!draftName.trim()} style={{ cursor: "pointer" }}>
              Save
            </button>
            <button onClick={() => setCreating(false)} style={{ cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
