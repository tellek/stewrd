import type { AiProvider } from "../state/hostSettings";

// The single table of AI providers Settings > AI offers and ai.ts dispatches
// on. Each provider has a CLI mode (an agent CLI the user signs in to
// themselves - Stewrd stores nothing for it) and/or an API-key mode (a direct
// HTTP call from Rust, key in the OS keychain - see secrets.rs).

export type AiProviderId = "claude" | "openai" | "gemini" | "copilot" | "cursor" | "grok" | "opencode" | "custom";

/** Provider-neutral reasoning tier a caller asks for; each provider maps it to
 * its own model + effort (defaults below, user-editable in Settings > AI). */
export type AiEffort = "low" | "medium" | "high";
export const AI_EFFORTS: AiEffort[] = ["low", "medium", "high"];

/** What a tier means for one provider. Empty strings mean "unset". */
export interface AiTier {
  model: string;
  effort: string;
}

/** Which tier fields a provider mode can apply, plus its built-in tiers. */
export interface TierSpec {
  model: boolean;
  effort: boolean;
  defaults: Record<AiEffort, AiTier>;
}

const NO_TIER: AiTier = { model: "", effort: "" };

/** Everything a CLI args builder needs. `viaStdin` means the prompt is NOT in
 * argv - it is piped to stdin instead. */
export interface CliArgsInput {
  binary: string;
  prompt: string;
  viaStdin: boolean;
  /** From the resolved tier (or the caller, Claude only). */
  model?: string;
  effort?: string;
  /** Claude-only agent options; other CLIs reject these before reaching here. */
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
  tiers?: TierSpec;
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
  tiers?: TierSpec;
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

const CLAUDE_TIERS: TierSpec = {
  model: true,
  effort: true,
  defaults: {
    low: { model: "haiku", effort: "low" },
    medium: { model: "sonnet", effort: "medium" },
    high: { model: "opus", effort: "high" },
  },
};

const sameModelTiers = (model: string): Record<AiEffort, AiTier> => ({
  low: { model, effort: "" },
  medium: { model, effort: "" },
  high: { model, effort: "" },
});

/** Same model at each effort level, Low/Medium/High reasoning. */
const gptTiers = (): Record<AiEffort, AiTier> => ({
  low: { model: "gpt-5", effort: "low" },
  medium: { model: "gpt-5", effort: "medium" },
  high: { model: "gpt-5", effort: "high" },
});

const levels = (model: string, efforts: [string, string, string]): Record<AiEffort, AiTier> => ({
  low: { model, effort: efforts[0] },
  medium: { model, effort: efforts[1] },
  high: { model, effort: efforts[2] },
});

const modelOnlyTiers = (model: string): TierSpec => ({ model: true, effort: false, defaults: sameModelTiers(model) });

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
      tiers: CLAUDE_TIERS,
      buildArgs: ({ prompt, viaStdin, model, effort, allowedTools, disallowedTools, extraArgs }) => [
        "-p",
        ...(viaStdin ? [] : [prompt]),
        ...withModel("--model", model),
        ...withModel("--effort", effort),
        ...(allowedTools?.length ? ["--allowedTools", allowedTools.join(",")] : []),
        ...(disallowedTools?.length ? ["--disallowedTools", disallowedTools.join(",")] : []),
        ...(extraArgs ?? []),
      ],
      installCommand: "irm https://claude.ai/install.ps1 | iex",
      loginCommand: "claude",
    },
    api: { kind: "anthropic", defaultModel: "", keyPlaceholder: "sk-ant-...", tiers: CLAUDE_TIERS },
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
      tiers: { model: true, effort: true, defaults: gptTiers() },
      // model/effort flags go before the trailing "-" (stdin prompt marker).
      buildArgs: ({ model, effort }) => [
        "exec",
        "-s",
        "read-only",
        "--skip-git-repo-check",
        "--color",
        "never",
        ...withModel("-m", model),
        ...(effort ? ["-c", `model_reasoning_effort=${effort}`] : []),
        "-",
      ],
      installCommand: "npm.cmd install -g @openai/codex",
      loginCommand: "codex login",
      statusArgs: ["login", "status"],
    },
    api: {
      kind: "openai-compat",
      defaultModel: "gpt-5",
      keyPlaceholder: "sk-...",
      tiers: { model: true, effort: true, defaults: gptTiers() },
    },
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
      // agy takes --model and --effort; the older gemini binary only -m.
      tiers: { model: true, effort: true, defaults: levels("gemini-3.8-flash", ["low", "medium", "high"]) },
      buildArgs: ({ binary, prompt, model, effort }) => [
        "-p",
        prompt,
        ...(binary === "agy" ? [...withModel("--model", model), ...withModel("--effort", effort)] : withModel("-m", model)),
      ],
      installCommand: "irm https://antigravity.google/cli/install.ps1 | iex",
      loginCommand: "agy",
    },
    api: { kind: "openai-compat", defaultModel: "gemini-3.8-flash", keyPlaceholder: "AIza...", tiers: { model: true, effort: true, defaults: levels("gemini-3.8-flash", ["low", "medium", "high"]) } },
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    cli: {
      binaries: ["copilot"],
      promptVia: "argv",
      supportsAgentOpts: false,
      // Blank model = Copilot's own default; effort only applies to models that support it.
      tiers: { model: true, effort: true, defaults: levels("", ["low", "medium", "high"]) },
      buildArgs: ({ prompt, model, effort }) => [
        "-p",
        prompt,
        "-s",
        "--deny-tool",
        "shell",
        ...withModel("--model", model),
        ...withModel("--reasoning-effort", effort),
      ],
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
      // No effort flag; blank model = Cursor's own default.
      tiers: { model: true, effort: false, defaults: levels("", ["", "", ""]) },
      buildArgs: ({ prompt, model }) => ["-p", prompt, "--trust", ...withModel("--model", model)],
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
      tiers: { model: true, effort: true, defaults: levels("grok-4.7", ["low", "medium", "high"]) },
      buildArgs: ({ prompt, model, effort }) => [
        "-p",
        prompt,
        ...withModel("-m", model),
        ...withModel("--effort", effort),
      ],
      installCommand: "irm https://x.ai/cli/install.ps1 | iex",
      loginCommand: "grok",
    },
    api: { kind: "openai-compat", defaultModel: "grok-4.7", keyPlaceholder: "xai-...", tiers: { model: true, effort: true, defaults: levels("grok-4.7", ["low", "medium", "high"]) } },
  },
  {
    id: "opencode",
    label: "OpenCode",
    cli: {
      binaries: ["opencode"],
      promptVia: "argv",
      supportsAgentOpts: false,
      // -m wants provider/model; --variant is the provider-specific reasoning level.
      // Blank = the user's OpenCode config.
      tiers: { model: true, effort: true, defaults: levels("", ["", "", ""]) },
      buildArgs: ({ prompt, model, effort }) => [
        "run",
        ...withModel("-m", model),
        ...withModel("--variant", effort),
        prompt,
      ],
      installCommand: "npm.cmd install -g opencode-ai",
      loginCommand: "opencode auth login",
    },
  },
  {
    id: "custom",
    label: "Custom (OpenAI-Compatible)",
    api: { kind: "openai-compat", defaultModel: "", keyPlaceholder: "Optional for local servers", tiers: modelOnlyTiers("") },
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

export type AiTierOverrides = Record<string, Partial<Record<AiEffort, Partial<AiTier>>>>;

/** The tier a provider mode applies for `effort`: the user's override per
 * field, else the built-in default. Empty values are "unset". Fields the mode
 * can't apply come back empty. */
export function tierFor(
  def: AiProviderDef,
  mode: AiMode,
  effort: AiEffort,
  overrides: AiTierOverrides,
): { model: string; effort: string; modelOverride: string; effortOverride: string } {
  const spec = def[mode]?.tiers;
  const base = spec?.defaults[effort] ?? NO_TIER;
  const user = overrides[def.id]?.[effort];
  const modelOverride = spec?.model ? (user?.model ?? "") : "";
  const effortOverride = spec?.effort ? (user?.effort ?? "") : "";
  return {
    model: spec?.model ? modelOverride || base.model : "",
    effort: spec?.effort ? effortOverride || base.effort : "",
    modelOverride,
    effortOverride,
  };
}
