import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/appStore";
import type { AiProvider } from "../state/hostSettings";
import { createShellApi } from "../api/shell";
import { createSecretsApi } from "../api/secrets";

const secrets = createSecretsApi();

const PROVIDER_OPTIONS: { id: AiProvider; label: string }[] = [
  { id: "claude-subscription", label: "Claude Subscription" },
  { id: "anthropic-api", label: "Anthropic API Key" },
];

export function SettingsAi() {
  const palette = useAppStore((s) => s.palette);
  const aiProvider = useAppStore((s) => s.aiProvider);
  const setAiProvider = useAppStore((s) => s.setAiProvider);

  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedNeedsRestart, setInstalledNeedsRestart] = useState(false);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  function checkCliInstalled() {
    invoke<boolean>("ai_claude_cli_installed")
      .then(setCliInstalled)
      .catch(() => setCliInstalled(false));
  }

  function checkHasKey() {
    secrets
      .hasAnthropicKey()
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }

  useEffect(() => {
    checkCliInstalled();
    checkHasKey();
  }, []);

  async function installClaudeCode() {
    setInstalling(true);
    setInstallOutput("");
    setInstallError(null);
    setInstalledNeedsRestart(false);
    const shell = createShellApi();
    const handle = shell.spawn("powershell", ["-NoProfile", "-Command", "irm https://claude.ai/install.ps1 | iex"], {
      onStdout: (chunk) => setInstallOutput((prev) => prev + chunk),
      onStderr: (chunk) => setInstallOutput((prev) => prev + chunk),
    });
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

  async function saveKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      await secrets.setAnthropicKey(keyInput);
      setKeyInput("");
      checkHasKey();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }

  async function clearKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      await secrets.clearAnthropicKey();
      checkHasKey();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, color: palette.text }}>AI Provider</h3>
      <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
        Every AI request in Stewrd - host features and plugins alike - flows through whichever provider is selected
        here.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PROVIDER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setAiProvider(opt.id)}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: `1px solid ${aiProvider === opt.id ? palette.accent : palette.border}`,
              background: aiProvider === opt.id ? palette.surfaceHover : palette.surface,
              color: palette.text,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {aiProvider === "claude-subscription" && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, color: palette.text }}>Claude Code CLI</h3>
          {cliInstalled === null && <p style={{ fontSize: 12, color: palette.textMuted }}>Checking...</p>}
          {cliInstalled === true && (
            <p style={{ fontSize: 12, color: palette.status.success }}>Detected on PATH.</p>
          )}
          {cliInstalled === false && !installedNeedsRestart && (
            <div>
              <p style={{ fontSize: 12, color: palette.status.warning }}>Not detected on PATH.</p>
              <button
                onClick={installClaudeCode}
                disabled={installing}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface,
                  color: palette.text,
                  cursor: installing ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {installing ? "Installing..." : "Install Claude Code"}
              </button>
              {installOutput && (
                <pre style={{ fontSize: 11, color: palette.textMuted, whiteSpace: "pre-wrap" }}>{installOutput}</pre>
              )}
              {installError && <p style={{ fontSize: 12, color: palette.status.error }}>{installError}</p>}
            </div>
          )}
          {installedNeedsRestart && (
            <p style={{ fontSize: 12, color: palette.status.success }}>
              Claude Code installed - restart Stewrd to finish setup.
            </p>
          )}
        </div>
      )}

      {aiProvider === "anthropic-api" && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, color: palette.text }}>Anthropic API Key</h3>
          <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
            Your key is encrypted in your OS credential store. Stewrd never displays it again once saved, and no AI
            can read it.
          </p>
          <p style={{ fontSize: 12, color: palette.textMuted, marginTop: -4 }}>
            {hasKey === null && "Checking..."}
            {hasKey === true && "Key configured ✓"}
            {hasKey === false && "Not configured"}
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: `1px solid ${palette.border}`,
              background: palette.surface,
              color: palette.text,
              fontSize: 12,
              width: 320,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={saveKey}
              disabled={keyBusy || !keyInput}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${palette.border}`,
                background: palette.surface,
                color: palette.text,
                cursor: keyBusy || !keyInput ? "default" : "pointer",
                fontSize: 12,
              }}
            >
              Save Key
            </button>
            <button
              onClick={clearKey}
              disabled={keyBusy || !hasKey}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${palette.border}`,
                background: palette.surface,
                color: palette.text,
                cursor: keyBusy || !hasKey ? "default" : "pointer",
                fontSize: 12,
              }}
            >
              Clear Key
            </button>
          </div>
          {keyError && <p style={{ fontSize: 12, color: palette.status.error }}>{keyError}</p>}
        </div>
      )}
    </div>
  );
}
