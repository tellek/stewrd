import { invoke } from "@tauri-apps/api/core";

// Wraps the Rust secrets.rs commands for the Anthropic API key. There is
// deliberately no "get" here - the key never crosses back over IPC into JS
// after being set. See src-tauri/src/commands/secrets.rs.
export interface SecretsApi {
  setAnthropicKey(key: string): Promise<void>;
  hasAnthropicKey(): Promise<boolean>;
  clearAnthropicKey(): Promise<void>;
}

export function createSecretsApi(): SecretsApi {
  return {
    setAnthropicKey: (key) => invoke<void>("secrets_set_anthropic_key", { key }),
    hasAnthropicKey: () => invoke<boolean>("secrets_has_anthropic_key"),
    clearAnthropicKey: () => invoke<void>("secrets_clear_anthropic_key"),
  };
}
