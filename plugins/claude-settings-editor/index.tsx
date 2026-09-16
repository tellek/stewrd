/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useEffect, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";

// Reads/writes ~/.claude/settings.json via a PowerShell one-liner (content is
// base64-encoded to sidestep all shell-quoting concerns for arbitrary JSON).
// This file lives outside the plugin's own sandboxed storage/fs scope, which
// is exactly why shell is the right tool here rather than api.fs.
const SETTINGS_PATH = "$env:USERPROFILE\\.claude\\settings.json";

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

async function readSettingsFile(api: PluginApi): Promise<string> {
  const script = `[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("${SETTINGS_PATH}"))`;
  const result = await api.shell.exec("powershell", ["-NoProfile", "-Command", script]);
  if (result.code !== 0) throw new Error(result.stderr || `powershell exited with code ${result.code}`);
  return fromBase64(result.stdout.trim());
}

async function writeSettingsFile(api: PluginApi, contents: string): Promise<void> {
  const b64 = toBase64(contents);
  const script = `[System.IO.File]::WriteAllBytes("${SETTINGS_PATH}", [Convert]::FromBase64String("${b64}"))`;
  const result = await api.shell.exec("powershell", ["-NoProfile", "-Command", script]);
  if (result.code !== 0) throw new Error(result.stderr || `powershell exited with code ${result.code}`);
}

export function activate(ctx: PluginContext) {
  ctx.api.log.info("claude-settings-editor activated");
}

export function Component({ api }: { api: PluginApi }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoaded(false);
    setLoadError(null);
    try {
      const contents = await readSettingsFile(api);
      setText(contents);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setError(null);
    try {
      JSON.parse(text); // blocks invalid JSON before it ever touches disk
    } catch (err) {
      setError(`Invalid JSON, not saved: ${err instanceof Error ? err.message : String(err)}`);
      api.statusIcon.set("error", "invalid JSON");
      return;
    }
    setSaving(true);
    api.statusIcon.set("in-progress", "saving...");
    try {
      await writeSettingsFile(api, text);
      api.statusIcon.set("success", "saved");
      api.toast.show({ message: "Settings saved", kind: "success" });
    } catch (err) {
      setError(String(err));
      api.statusIcon.set("error", "save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p>Loading...</p>;
  if (loadError) return <p style={{ color: "#ef4444" }}>Failed to read settings.json: {loadError}</p>;

  return (
    <div>
      <h2>Claude Settings</h2>
      <p>Editing ~/.claude/settings.json - invalid JSON is blocked before it ever reaches disk.</p>
      <api.ui.TextBox value={text} onChange={setText} rows={20} />
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}
      <p>
        <button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>{" "}
        <button onClick={load} disabled={saving}>
          Reload
        </button>
      </p>
    </div>
  );
}
