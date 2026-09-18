import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../state/appStore";
import {
  installPluginFromArchive,
  listPlugins,
  readPluginSettingsFile,
  removePlugin,
  setPluginDisabled,
  writePluginSettingsFile,
  type PluginDiscoveryEntry,
} from "../loader/pluginDiscovery";
import { createModalApi } from "../api/modals";
import { createToastApi } from "../api/toast";
import { TextBox } from "../../components/TextBox/TextBox";

const modal = createModalApi();
const toast = createToastApi();

// Mirrors plugins/claude-settings-editor/index.tsx's pattern (raw text,
// JSON.parse validated client-side before it ever touches disk) but at host
// level, editing a plugin's own settings.json directly rather than a form
// generated from a schema - settings.json IS the plugin's config now.
function ConfigurePanel({ dir, onCancel }: { dir: string; onCancel: () => void }) {
  const palette = useAppStore((s) => s.palette);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    setLoadError(null);
    setSaveError(null);
    try {
      setText(await readPluginSettingsFile(dir));
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoaded(true);
    }
  }, [dir]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaveError(null);
    try {
      JSON.parse(text); // blocks invalid JSON before it ever touches disk
    } catch (err) {
      setSaveError(`Invalid JSON, not saved: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setSaving(true);
    try {
      await writePluginSettingsFile(dir, text);
      toast.show({ message: "settings.json saved", kind: "success" });
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "8px 12px", background: palette.surface, borderRadius: 4, marginTop: 4 }}>
      {!loaded && <p style={{ color: palette.textMuted, fontSize: 12 }}>Loading...</p>}
      {loadError && <p style={{ color: palette.status.error, fontSize: 12 }}>Failed to read settings.json: {loadError}</p>}
      {loaded && !loadError && (
        <>
          <TextBox value={text} onChange={setText} rows={10} />
          {saveError && <p style={{ color: palette.status.error, fontSize: 12 }}>{saveError}</p>}
          <div style={{ marginTop: 6 }}>
            <button onClick={save} disabled={saving} style={{ cursor: "pointer", marginRight: 6 }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={onCancel} disabled={saving} style={{ cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function SettingsPlugins() {
  const palette = useAppStore((s) => s.palette);
  const [entries, setEntries] = useState<PluginDiscoveryEntry[]>([]);
  const [configuring, setConfiguring] = useState<string | null>(null);
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
        immediately; removing one deletes its folder from disk. Configure opens the plugin's own{" "}
        <code>settings.json</code> for direct editing - the reserved <code>"category"</code> key controls sidebar
        grouping.
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
            const { manifest, disabled, dir, category, version } = entry;
            return (
              <Fragment key={manifest.id}>
                <tr style={{ borderBottom: configuring === manifest.id ? "none" : `1px solid ${palette.border}` }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div>
                      {manifest.name} <span style={{ color: palette.textMuted, fontSize: 11 }}>v{version || "?"}</span>
                    </div>
                    <div style={{ color: palette.textMuted, fontSize: 11 }}>
                      {manifest.description} · category: {category || "Other"}
                    </div>
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
                    <button
                      onClick={() => setConfiguring(configuring === manifest.id ? null : manifest.id)}
                      style={{ cursor: "pointer", marginRight: 6 }}
                    >
                      Configure
                    </button>
                    <button onClick={() => onToggleDisabled(entry)} style={{ cursor: "pointer", marginRight: 6 }}>
                      {disabled ? "Activate" : "Deactivate"}
                    </button>
                    <button onClick={() => onRemove(dir, manifest.name)} style={{ cursor: "pointer" }}>
                      Remove
                    </button>
                  </td>
                </tr>
                {configuring === manifest.id && (
                  <tr style={{ borderBottom: `1px solid ${palette.border}` }}>
                    <td style={{ padding: "0 8px 8px" }} colSpan={3}>
                      <ConfigurePanel dir={dir} onCancel={() => setConfiguring(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
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
