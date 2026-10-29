import { Fragment, useCallback, useMemo, useEffect, useRef, useState } from "react";
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
import { TextButton } from "../../components/TextButton/TextButton";
import { IconButton } from "../../components/IconButton/IconButton";
import { invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { CreatePluginModal } from "./CreatePluginModal";
import { PublishPluginModal } from "./PublishPluginModal";
import type { PublishPlugin } from "./publishPluginSteps";
import { activateIcon, configureIcon, deactivateIcon, publishIcon, removeIcon, reportIssueIcon } from "./pluginActionIcons";

const modal = createModalApi();
const toast = createToastApi();

// Same catalog the Marketplace plugin browses; maps a plugin id to its GitHub
// repo so each row can link to that repo's issues page.
const CATALOG_URL = "https://raw.githubusercontent.com/tellek/stewrd/main/docs/plugin-catalog.json";
// Bundled with the app, so never publishable and always reported against the app's repo.
const BUNDLED_IDS = new Set(["marketplace", "_template"]);
// Plugins that ship with the app and aren't in the catalog live in this repo.
const HOST_REPO = "tellek/stewrd";

async function fetchRepoById(): Promise<Map<string, string>> {
  const resp = await fetch(CATALOG_URL);
  if (!resp.ok) throw new Error(`catalog fetch returned ${resp.status}`);
  const entries = (await resp.json()) as { id: string; repo: string }[];
  return new Map(entries.map((e) => [e.id, e.repo]));
}

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
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <TextButton label={saving ? "Saving..." : "Save"} onClick={save} disabled={saving} variant="primary" />
            <TextButton label="Cancel" onClick={onCancel} disabled={saving} />
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
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<PublishPlugin | null>(null);
  const [repoById, setRepoById] = useState<Map<string, string>>(new Map());
  const catalogIds = useMemo(() => new Set(repoById.keys()), [repoById]);
  // Plugins you made (not bundled, not in the Marketplace catalog) get Publish
  // in place of Report an Issue. Needs a loaded catalog: offline, every plugin
  // would otherwise look unpublished.
  const canPublish = (id: string) => catalogIds.size > 0 && !catalogIds.has(id) && !BUNDLED_IDS.has(id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listPlugins().then(setEntries);
  }, []);

  useEffect(() => {
    fetchRepoById()
      .then(setRepoById)
      .catch(() => {}); // offline: issue buttons fall back to the app's own repo
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

  async function onRemove(dir: string, name: string, id: string) {
    if (id === "marketplace") return;
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

  async function onOpenPluginsFolder() {
    try {
      await revealItemInDir(await invoke<string>("get_plugins_dir"));
    } catch (err) {
      toast.show({ message: `Couldn't open the plugins folder: ${String(err)}`, kind: "error" });
    }
  }

  function onReportIssue(id: string) {
    const repo = repoById.get(id) ?? HOST_REPO;
    openUrl(`https://github.com/${repo}/issues`).catch((err) =>
      toast.show({ message: `Couldn't open the issues page: ${String(err)}`, kind: "error" }),
    );
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz"
            disabled={installing}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFilePicked(file);
            }}
          />
          <span title="Accepts .zip, .tar, .tar.gz, or .tgz archives">
            <TextButton label="Add Plugin" onClick={() => fileInputRef.current?.click()} disabled={installing} />
          </span>
          <TextButton label="Open Plugins Folder" onClick={onOpenPluginsFolder} bordered={false} />
        </div>
        <TextButton label="Create New Plugin" variant="primary" onClick={() => setCreating(true)} />
      </div>
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
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconButton
                        icon={configureIcon}
                        label="Configure"
                        onClick={() => setConfiguring(configuring === manifest.id ? null : manifest.id)}
                      />
                      <IconButton
                        icon={disabled ? activateIcon : deactivateIcon}
                        label={disabled ? "Activate" : "Deactivate"}
                        onClick={() => onToggleDisabled(entry)}
                      />
                      {canPublish(manifest.id) ? (
                        <IconButton
                          icon={publishIcon}
                          label="Publish To Marketplace"
                          onClick={() =>
                            setPublishing({
                              dir,
                              id: manifest.id,
                              name: manifest.name,
                              description: manifest.description,
                              apiVersion: manifest.apiVersion,
                              category,
                            })
                          }
                        />
                      ) : (
                        <IconButton
                          icon={reportIssueIcon}
                          label="Report an Issue"
                          onClick={() => onReportIssue(manifest.id)}
                        />
                      )}
                      <IconButton
                        icon={removeIcon}
                        label="Remove"
                        disabled={manifest.id === "marketplace"}
                        onClick={() => onRemove(dir, manifest.name, manifest.id)}
                      />
                    </div>
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

      <CreatePluginModal open={creating} onClose={() => setCreating(false)} />
      <PublishPluginModal plugin={publishing} catalogIds={catalogIds} onClose={() => setPublishing(null)} />
    </div>
  );
}
