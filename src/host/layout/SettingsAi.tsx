import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/appStore";
import type { Palette } from "../../shared/palette";
import { createShellApi } from "../api/shell";
import { createSecretsApi } from "../api/secrets";
import {
  AI_PROVIDERS,
  normalizeAiProvider,
  parseAiProvider,
  toAiProvider,
  type AiMode,
  type AiProviderDef,
} from "../api/aiProviders";

const secrets = createSecretsApi();

const MODE_LABELS: Record<AiMode, string> = { cli: "CLI", api: "API Key" };

function buttonStyle(palette: Palette, disabled = false, active = false): CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 4,
    border: `1px solid ${active ? palette.accent : palette.border}`,
    background: active ? palette.surfaceHover : palette.surface,
    color: palette.text,
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
  };
}

function inputStyle(palette: Palette, width = 320): CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 4,
    border: `1px solid ${palette.border}`,
    background: palette.surface,
    color: palette.text,
    fontSize: 12,
    width,
  };
}

function CliPanel({ def }: { def: AiProviderDef }) {
  const palette = useAppStore((s) => s.palette);
  const cli = def.cli!;
  const [found, setFound] = useState<string | null | undefined>(undefined);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedNeedsRestart, setInstalledNeedsRestart] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFound(undefined);
    setSignedIn(null);
    (async () => {
      let path: string | null = null;
      let name = cli.binaries[0]!;
      for (const binary of cli.binaries) {
        path = await invoke<string | null>("ai_cli_path", { binary }).catch(() => null);
        if (path) {
          name = binary;
          break;
        }
      }
      if (cancelled) return;
      setFound(path);
      if (path && cli.statusArgs) {
        const result = await createShellApi()
          .exec(name, cli.statusArgs)
          .catch(() => null);
        if (!cancelled) setSignedIn(result ? result.code === 0 : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cli]);

  async function install() {
    setInstalling(true);
    setInstallOutput("");
    setInstallError(null);
    setInstalledNeedsRestart(false);
    const handle = createShellApi().spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cli.installCommand!],
      {
        onStdout: (chunk) => setInstallOutput((prev) => prev + chunk),
        onStderr: (chunk) => setInstallOutput((prev) => prev + chunk),
      },
    );
    try {
      const { code } = await handle.done;
      if (code === 0) setInstalledNeedsRestart(true);
      else setInstallError(`Install exited with code ${code}`);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 13, color: palette.text }}>{def.label} CLI</h3>
      {found === undefined && <p style={{ fontSize: 12, color: palette.textMuted }}>Checking...</p>}
      {found && <p style={{ fontSize: 12, color: palette.status.success }}>Detected on PATH.</p>}
      {found === null && !installedNeedsRestart && (
        <div>
          <p style={{ fontSize: 12, color: palette.status.warning }}>Not detected on PATH.</p>
          {cli.installCommand && (
            <button onClick={install} disabled={installing} style={buttonStyle(palette, installing)}>
              {installing ? "Installing..." : `Install ${def.label} CLI`}
            </button>
          )}
          {installOutput && (
            <pre style={{ fontSize: 11, color: palette.textMuted, whiteSpace: "pre-wrap" }}>{installOutput}</pre>
          )}
          {installError && <p style={{ fontSize: 12, color: palette.status.error }}>{installError}</p>}
        </div>
      )}
      {installedNeedsRestart && (
        <p style={{ fontSize: 12, color: palette.status.success }}>
          {def.label} CLI installed - restart Stewrd to finish setup.
        </p>
      )}
      {found && signedIn !== null && (
        <p style={{ fontSize: 12, color: signedIn ? palette.status.success : palette.status.warning }}>
          {signedIn ? "Signed in." : "Not signed in."}
        </p>
      )}
      <p style={{ fontSize: 12, color: palette.textMuted }}>
        Sign in by running <code>{cli.loginCommand}</code> in a terminal. The CLI keeps its own login; Stewrd stores
        nothing for it.
      </p>
      <button
        onClick={() => void navigator.clipboard?.writeText(cli.loginCommand.split("  ")[0]!)}
        style={buttonStyle(palette)}
      >
        Copy Login Command
      </button>
    </div>
  );
}

function ApiPanel({ def }: { def: AiProviderDef }) {
  const palette = useAppStore((s) => s.palette);
  const aiModels = useAppStore((s) => s.aiModels);
  const setAiModel = useAppStore((s) => s.setAiModel);
  const api = def.api!;
  const isCustom = def.id === "custom";
  const isClaude = def.id === "claude";

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(aiModels[def.id] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    secrets
      .hasKey(def.id)
      .then(setHasKey)
      .catch(() => setHasKey(false));
    if (isCustom) {
      secrets
        .getCustomBaseUrl()
        .then((url) => setBaseUrl(url ?? ""))
        .catch(() => {});
    }
  }

  useEffect(() => {
    setKeyInput("");
    setError(null);
    setModel(useAppStore.getState().aiModels[def.id] ?? "");
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setKeyInput("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canSave = isCustom ? Boolean(baseUrl.trim()) : Boolean(keyInput);
  const label = isCustom ? "Endpoint" : "API Key";

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 13, color: palette.text }}>
        {def.label} {label}
      </h3>
      <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
        {hasKey === null && "Checking..."}
        {hasKey === true && (isCustom ? "Endpoint configured ✓" : "Key configured ✓")}
        {hasKey === false && "Not configured"}
      </p>

      {!isClaude && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: palette.textMuted, marginBottom: 4 }}>
            Model{isCustom ? "" : ` (default: ${api.defaultModel})`}
          </div>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => setAiModel(def.id, model.trim())}
            placeholder={api.defaultModel || "e.g. deepseek-v4-pro"}
            style={inputStyle(palette)}
          />
        </div>
      )}

      {isCustom && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: palette.textMuted, marginBottom: 4 }}>Base URL</div>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
            style={inputStyle(palette)}
          />
          <p style={{ fontSize: 11, color: palette.textMuted }}>
            Saving replaces the stored endpoint and key together. Leave the key empty for a local server such as Ollama.
          </p>
        </div>
      )}

      <input
        type="password"
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        placeholder={api.keyPlaceholder}
        style={inputStyle(palette)}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => run(() => (isCustom ? secrets.setCustom(baseUrl, keyInput) : secrets.setKey(def.id, keyInput)))}
          disabled={busy || !canSave}
          style={buttonStyle(palette, busy || !canSave)}
        >
          {isCustom ? "Save Endpoint" : "Save Key"}
        </button>
        <button
          onClick={() => run(() => secrets.clearKey(def.id))}
          disabled={busy || !hasKey}
          style={buttonStyle(palette, busy || !hasKey)}
        >
          {isCustom ? "Clear Endpoint" : "Clear Key"}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: palette.status.error }}>{error}</p>}
    </div>
  );
}

export function SettingsAi() {
  const palette = useAppStore((s) => s.palette);
  const aiProvider = useAppStore((s) => s.aiProvider);
  const setAiProvider = useAppStore((s) => s.setAiProvider);

  const { def, mode } = parseAiProvider(normalizeAiProvider(aiProvider));

  function chooseProvider(id: string) {
    const next = AI_PROVIDERS.find((p) => p.id === id)!;
    setAiProvider(toAiProvider(next.id, next[mode] ? mode : next.cli ? "cli" : "api"));
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, color: palette.text }}>AI Provider</h3>
      <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
        Every AI request in Stewrd - host features and plugins alike - flows through whichever provider is selected
        here.
      </p>
      <p
        style={{
          fontSize: 12,
          color: palette.textMuted,
          padding: "8px 10px",
          borderRadius: 4,
          border: `1px solid ${palette.border}`,
          background: palette.surface,
        }}
      >
        <strong style={{ color: palette.text }}>How secrets are stored.</strong> API keys are saved only in your
        operating system's keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service), which
        encrypts them at rest. Stewrd never writes a key to its own files or settings, and only its backend reads one
        back, to make the request. Stewrd never passes a key to the AI (an agent CLI with shell access runs as you and
        could still read your keychain). CLI providers use their own sign-in, so Stewrd stores nothing for them.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          aria-label="Provider"
          value={def.id}
          onChange={(e) => chooseProvider(e.target.value)}
          style={inputStyle(palette, 220)}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {(["cli", "api"] as AiMode[])
          .filter((m) => def[m])
          .map((m) => (
            <button
              key={m}
              onClick={() => setAiProvider(toAiProvider(def.id, m))}
              style={buttonStyle(palette, false, mode === m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
      </div>

      {mode === "cli" ? <CliPanel def={def} /> : <ApiPanel def={def} />}
    </div>
  );
}
