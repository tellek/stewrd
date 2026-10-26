import { invoke } from "@tauri-apps/api/core";

// Wraps the Rust secrets.rs commands for AI provider API keys, which live in
// the OS keychain. There is deliberately no "get" here - a key never crosses
// back over IPC into JS after being set. See src-tauri/src/commands/secrets.rs.
export interface SecretsApi {
  /** Save a key for a built-in provider id ("claude" | "openai" | "gemini" | "grok"). */
  setKey(provider: string, key: string): Promise<void>;
  /** The custom endpoint's URL and key are saved together, atomically. */
  setCustom(baseUrl: string, key: string): Promise<void>;
  /** For "custom": an endpoint is saved. For the others: a key is saved. */
  hasKey(provider: string): Promise<boolean>;
  clearKey(provider: string): Promise<void>;
  /** Non-secret, display only. */
  getCustomBaseUrl(): Promise<string | null>;
}

export function createSecretsApi(): SecretsApi {
  return {
    setKey: (provider, key) => invoke<void>("secrets_set_key", { provider, key }),
    setCustom: (baseUrl, key) => invoke<void>("secrets_set_custom", { baseUrl, key }),
    hasKey: (provider) => invoke<boolean>("secrets_has_key", { provider }),
    clearKey: (provider) => invoke<void>("secrets_clear_key", { provider }),
    getCustomBaseUrl: () => invoke<string | null>("secrets_get_custom_base_url"),
  };
}
