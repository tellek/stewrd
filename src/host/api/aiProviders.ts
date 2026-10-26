import type { AiProvider } from "../state/hostSettings";

// The single table of AI providers Settings > AI offers and ai.ts dispatches
// on. Each provider has a CLI mode (an agent CLI the user signs in to
// themselves - Stewrd stores nothing for it) and/or an API-key mode (a direct
// HTTP call from Rust, key in the OS keychain - see secrets.rs).

export type AiProviderId = "claude" | "openai" | "gemini" | "copilot" | "cursor" | "grok" | "opencode" | "custom";

/** Everything a CLI args builder needs. `viaStdin` means the prompt is NOT in
 * argv - it is piped to stdin instead. */
export interface CliArgsInput {
  binary: string;
  prompt: string;
  viaStdin: boolean;
  /** Claude-only agent options; other CLIs reject these before reaching here. */
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  extraArgs?: string[];
}

export interface CliSpec {
  /** Candidate binaries, first one found on PATH wins. */
  binaries: string[];
  /** "stdin": always pipe the prompt. "argv": pass it as an argument, except
   * when stdinWhenShim and the binary resolved to a `.cmd` shim. */
  promptVia: "argv" | "stdin";
  stdinWhenShim?: boolean;
  /** Only claude understands allowedTools/disallowedTools/extraArgs/model. */
  supportsAgentOpts: boolean;
  buildArgs(input: CliArgsInput): string[];
  /** PowerShell command that installs the CLI (Windows), if there is one. */
  installCommand?: string;
  /** What the user types to sign in, shown in the CLI panel. */
  loginCommand: string;
  /** Optional `<binary> <args>` whose exit code 0 means "signed in". */
  statusArgs?: string[];
}

export interface ApiSpec {
  kind: "anthropic" | "openai-compat";
  defaultModel: string;
  keyPlaceholder: string;
}

export interface AiProviderDef {
  id: AiProviderId;
  label: string;
  cli?: CliSpec;
  api?: ApiSpec;
}

/** Flags that auto-approve actions or open up shell access. CLI args builders
 * must never emit these - see aiProviders.test.ts. */
export const FORBIDDEN_CLI_FLAGS = [
  "--allow-all-tools",
  "--allow-all",
  "--yolo",
  "--force",
  "-f",
  "--auto",
  "--dangerously-skip-permissions",
  "--dangerously-bypass-approvals-and-sandbox",
  "danger-full-access",
];

const withModel = (flag: string, model?: string) => (model ? [flag, model] : []);

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: "claude",
    label: "Claude",
    cli: {
      binaries: ["claude"],
      promptVia: "argv",
      stdinWhenShim: true,
      supportsAgentOpts: true,
      buildArgs: ({ prompt, viaStdin, model, allowedTools, disallowedTools, extraArgs }) => [
        "-p",
        ...(viaStdin ? [] : [prompt]),
        ...withModel("--model", model),
        ...(allowedTools?.length ? ["--allowedTools", allowedTools.join(",")] : []),
        ...(disallowedTools?.length ? ["--disallowedTools", disallowedTools.join(",")] : []),
        ...(extraArgs ?? []),
      ],
      installCommand: "irm https://claude.ai/install.ps1 | iex",
      loginCommand: "claude",
    },
    api: { kind: "anthropic", defaultModel: "", keyPlaceholder: "sk-ant-..." },
  },
  {
    id: "openai",
    label: "OpenAI",
    cli: {
      binaries: ["codex"],
      promptVia: "stdin",
      supportsAgentOpts: false,
      // read-only sandbox, and skip the git-repo check because palette
      // generation runs in a temp dir.
      buildArgs: () => ["exec", "-s", "read-only", "--skip-git-repo-check", "--color", "never", "-"],
      installCommand: "npm.cmd install -g @openai/codex",
      loginCommand: "codex login",
      statusArgs: ["login", "status"],
    },
    api: { kind: "openai-compat", defaultModel: "gpt-5", keyPlaceholder: "sk-..." },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    cli: {
      // Antigravity CLI replaced Gemini CLI for unpaid/Google One users.
      binaries: ["agy", "gemini"],
      promptVia: "argv",
      supportsAgentOpts: false,
      // Same shape for both binaries: -p takes the prompt as its value.
      buildArgs: ({ prompt }) => ["-p", prompt],
      installCommand: "irm https://antigravity.google/cli/install.ps1 | iex",
      loginCommand: "agy",
    },
    api: { kind: "openai-compat", defaultModel: "gemini-3.8-flash", keyPlaceholder: "AIza..." },
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    cli: {
      binaries: ["copilot"],
      promptVia: "argv",
      supportsAgentOpts: false,
      buildArgs: ({ prompt }) => ["-p", prompt, "-s", "--deny-tool", "shell"],
      installCommand: "winget install GitHub.Copilot",
      loginCommand: "copilot  (then type /login)",
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    cli: {
      binaries: ["agent"],
      promptVia: "argv",
      supportsAgentOpts: false,
      buildArgs: ({ prompt }) => ["-p", prompt, "--trust"],
      installCommand: "irm 'https://cursor.com/install?win32=true' | iex",
      loginCommand: "agent login",
    },
  },
  {
    id: "grok",
    label: "Grok",
    cli: {
      binaries: ["grok"],
      promptVia: "argv",
      supportsAgentOpts: false,
      buildArgs: ({ prompt }) => ["-p", prompt],
      installCommand: "irm https://x.ai/cli/install.ps1 | iex",
      loginCommand: "grok",
    },
    api: { kind: "openai-compat", defaultModel: "grok-4.7", keyPlaceholder: "xai-..." },
  },
  {
    id: "opencode",
    label: "OpenCode",
    cli: {
      binaries: ["opencode"],
      promptVia: "argv",
      supportsAgentOpts: false,
      buildArgs: ({ prompt }) => ["run", prompt],
      installCommand: "npm.cmd install -g opencode-ai",
      loginCommand: "opencode auth login",
    },
  },
  {
    id: "custom",
    label: "Custom (OpenAI-Compatible)",
    api: { kind: "openai-compat", defaultModel: "", keyPlaceholder: "Optional for local servers" },
  },
];

export const DEFAULT_AI_PROVIDER: AiProvider = "claude-cli";

export type AiMode = "cli" | "api";

export function providerDef(id: AiProviderId): AiProviderDef {
  const def = AI_PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown AI provider: ${id}`);
  return def;
}

export function parseAiProvider(provider: AiProvider): { def: AiProviderDef; mode: AiMode } {
  const match = /^(.+)-(cli|api)$/.exec(provider);
  const def = match ? AI_PROVIDERS.find((p) => p.id === match[1]) : undefined;
  const mode = match?.[2] as AiMode | undefined;
  if (!def || !mode || !def[mode]) throw new Error(`Unknown AI provider: ${provider}`);
  return { def, mode };
}

export function toAiProvider(id: AiProviderId, mode: AiMode): AiProvider {
  return `${id}-${mode}` as AiProvider;
}

/** Normalizes a stored value: maps the two pre-multi-provider ids, and falls
 * back to the default for anything that isn't a valid provider/mode pair. */
export function normalizeAiProvider(value: unknown): AiProvider {
  if (value === "claude-subscription") return "claude-cli";
  if (value === "anthropic-api") return "claude-api";
  if (typeof value === "string") {
    try {
      parseAiProvider(value as AiProvider);
      return value as AiProvider;
    } catch {
      // fall through
    }
  }
  return DEFAULT_AI_PROVIDER;
}

/** Providers that hold a key in the OS keychain (Rust: secrets.rs KEY_PROVIDERS). */
export const KEY_PROVIDER_IDS: AiProviderId[] = AI_PROVIDERS.filter((p) => p.api).map((p) => p.id);

/** Every CLI binary Settings may probe (Rust: shell.rs AI_CLI_BINARIES). */
export const CLI_BINARIES: string[] = AI_PROVIDERS.flatMap((p) => p.cli?.binaries ?? []);

export function defaultModelFor(def: AiProviderDef): string {
  return def.api?.defaultModel ?? "";
}
