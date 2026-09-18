import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../state/appStore";
import type { Palette } from "../../shared/palette";
import {
  installPluginFromArchive,
  listPlugins,
  removePlugin,
  setPluginDisabled,
  type PluginDiscoveryEntry,
  type SettingsField,
} from "../loader/pluginDiscovery";
import { createStorageApi } from "../api/storage";
import { createModalApi } from "../api/modals";
import { createToastApi } from "../api/toast";

const modal = createModalApi();
const toast = createToastApi();

function fieldInputStyle(palette: Palette) {
  return {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: 4,
    padding: "4px 6px",
  };
}

function SettingsPanel({ pluginId, schema }: { pluginId: string; schema: SettingsField[] }) {
  const palette = useAppStore((s) => s.palette);
  const storage = useRef(createStorageApi(pluginId)).current;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage.getAll<Record<string, unknown>>().then((stored) => {
      if (cancelled) return;
      const next: Record<string, unknown> = {};
      for (const field of schema) {
        next[field.key] = field.key in stored ? stored[field.key] : field.default;
      }
      setValues(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, schema]);

  if (!loaded) return null;

  // HTML inputs always hand back strings/booleans off `e.target` - saving a
  // raw event value for a "number" field would silently persist a string
  // (e.g. "14") that a plugin's own `ctx.api.storage.get<number>(key)` would
  // receive as-is with no error, so each field type is coerced before save.
  function save(field: SettingsField, raw: string | boolean) {
    let coerced: unknown;
    if (field.type === "number") {
      const n = typeof raw === "string" ? Number(raw) : NaN;
      coerced = raw === "" || Number.isNaN(n) ? field.default : n;
    } else if (field.type === "boolean") {
      coerced = Boolean(raw);
    } else {
      coerced = raw;
    }
    setValues((v) => ({ ...v, [field.key]: coerced }));
    storage.set(field.key, coerced);
  }

  return (
    <div style={{ padding: "8px 12px", background: palette.surface, borderRadius: 4, marginTop: 4 }}>
      {schema.map((field) => (
        <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <label style={{ minWidth: 160, fontSize: 12, color: palette.textMuted }}>{field.label}</label>
          {field.type === "boolean" && (
            <input
              type="checkbox"
              checked={Boolean(values[field.key])}
              onChange={(e) => save(field, e.target.checked)}
            />
          )}
          {field.type === "select" && (
            <select
              value={String(values[field.key] ?? "")}
              onChange={(e) => save(field, e.target.value)}
              style={fieldInputStyle(palette)}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {field.type === "number" && (
            <input
              type="number"
              value={String(values[field.key] ?? "")}
              onChange={(e) => save(field, e.target.value)}
              style={fieldInputStyle(palette)}
            />
          )}
          {field.type === "string" && (
            <input
              type="text"
              value={String(values[field.key] ?? "")}
              onChange={(e) => save(field, e.target.value)}
              style={fieldInputStyle(palette)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function SettingsPlugins() {
  const palette = useAppStore((s) => s.palette);
  const [entries, setEntries] = useState<PluginDiscoveryEntry[]>([]);
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listPlugins().then(setEntries);
  }, []);

  useEffect(() => {
    refresh();
    const unlistenPromise = listen("plugin-changed", () => refresh());
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refresh]);

  async function onToggleDisabled(entry: Extract<PluginDiscoveryEntry, { status: "ok" }>) {
    await setPluginDisabled(entry.manifest.id, entry.dir, !entry.disabled);
  }

  async function onRemove(dir: string, name: string) {
    const confirmed = await modal.confirm({
      title: "Remove plugin",
      message: `Delete "${name}"? This removes its folder from disk and cannot be undone.`,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    try {
      await removePlugin(dir);
      toast.show({ message: `Removed "${name}"`, kind: "success" });
    } catch (err) {
      await modal.error({ title: "Remove failed", message: String(err) });
    }
  }

  async function onFilePicked(file: File) {
    setInstalling(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dir = await installPluginFromArchive(bytes, file.name);
      toast.show({ message: `Installed plugin into "${dir}"`, kind: "success" });
    } catch (err) {
      await modal.error({ title: "Install failed", message: String(err) });
    } finally {
      setInstalling(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <p style={{ color: palette.textMuted, fontSize: 13 }}>
        Installed plugins live in this app's own <code>plugins/</code> folder. Deactivating a plugin here unloads it
        immediately; removing one deletes its folder from disk.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {entries.map((entry) => {
            if (entry.status === "error") {
              return (
                <tr key={entry.dir} style={{ borderBottom: `1px solid ${palette.border}` }}>
                  <td style={{ padding: "6px 8px" }} colSpan={3}>
                    <strong>{entry.dir}</strong>
                    <div style={{ color: palette.status.error, fontSize: 12 }}>{entry.message}</div>
                  </td>
                </tr>
              );
            }
            const { manifest, disabled, dir, settingsSchema } = entry;
            return (
              <tr key={manifest.id} style={{ borderBottom: `1px solid ${palette.border}` }}>
                <td style={{ padding: "6px 8px" }}>
                  <div>
                    {manifest.name} <span style={{ color: palette.textMuted, fontSize: 11 }}>v{manifest.version}</span>
                  </div>
                  <div style={{ color: palette.textMuted, fontSize: 11 }}>{manifest.description}</div>
                  {expandedSettings === manifest.id && (
                    <SettingsPanel pluginId={manifest.id} schema={settingsSchema} />
                  )}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: disabled ? palette.textMuted : palette.status.success,
                    fontSize: 12,
                  }}
                >
                  {disabled ? "Disabled" : "Enabled"}
                </td>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                  <button onClick={() => onToggleDisabled(entry)} style={{ cursor: "pointer", marginRight: 6 }}>
                    {disabled ? "Activate" : "Deactivate"}
                  </button>
                  {settingsSchema.length > 0 && (
                    <button
                      onClick={() => setExpandedSettings(expandedSettings === manifest.id ? null : manifest.id)}
                      style={{ cursor: "pointer", marginRight: 6 }}
                    >
                      Settings
                    </button>
                  )}
                  <button onClick={() => onRemove(dir, manifest.name)} style={{ cursor: "pointer" }}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ fontSize: 13, marginTop: 20 }}>Add plugin</h3>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.tar,.tar.gz,.tgz"
        disabled={installing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFilePicked(file);
        }}
      />
      <p style={{ color: palette.textMuted, fontSize: 11 }}>Accepts .zip, .tar, .tar.gz, or .tgz archives.</p>
    </div>
  );
}
