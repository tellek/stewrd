import { describe, expect, it } from "vitest";
import secretsRs from "../../../src-tauri/src/commands/secrets.rs?raw";
import shellRs from "../../../src-tauri/src/commands/shell.rs?raw";
import {
  AI_PROVIDERS,
  CLI_BINARIES,
  FORBIDDEN_CLI_FLAGS,
  KEY_PROVIDER_IDS,
  normalizeAiProvider,
  parseAiProvider,
  tierFor,
} from "./aiProviders";

function rustList(source: string, name: string): string[] {
  const match = new RegExp(`${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("Rust allowlists stay in sync with the registry", () => {
  it("secrets.rs KEY_PROVIDERS matches the providers with an API mode", () => {
    expect(rustList(secretsRs, "KEY_PROVIDERS").sort()).toEqual([...KEY_PROVIDER_IDS].sort());
  });

  it("shell.rs AI_CLI_BINARIES matches every CLI binary in the registry", () => {
    expect(rustList(shellRs, "AI_CLI_BINARIES").sort()).toEqual([...CLI_BINARIES].sort());
  });
});

describe("normalizeAiProvider", () => {
  it("maps the two legacy ids", () => {
    expect(normalizeAiProvider("claude-subscription")).toBe("claude-cli");
    expect(normalizeAiProvider("anthropic-api")).toBe("claude-api");
  });

  it("keeps valid ids and falls back to the default for garbage", () => {
    expect(normalizeAiProvider("openai-api")).toBe("openai-api");
    expect(normalizeAiProvider("custom-api")).toBe("custom-api");
    expect(normalizeAiProvider("custom-cli")).toBe("claude-cli");
    expect(normalizeAiProvider("nope")).toBe("claude-cli");
    expect(normalizeAiProvider(42)).toBe("claude-cli");
    expect(normalizeAiProvider(undefined)).toBe("claude-cli");
  });

  it("parseAiProvider throws for a mode the provider lacks", () => {
    expect(() => parseAiProvider("copilot-api" as never)).toThrow();
  });
});

describe("CLI args builders", () => {
  const input = { prompt: "do it", viaStdin: false } as const;

  it("never emit auto-approve or shell-access flags", () => {
    for (const def of AI_PROVIDERS) {
      if (!def.cli) continue;
      for (const binary of def.cli.binaries) {
        const args = def.cli.buildArgs({ ...input, binary });
        for (const flag of FORBIDDEN_CLI_FLAGS) expect(args, `${binary} ${flag}`).not.toContain(flag);
      }
    }
  });

  it("deny Copilot's shell tool as two separate argv entries (no shell quoting)", () => {
    const copilot = AI_PROVIDERS.find((p) => p.id === "copilot")!.cli!;
    expect(copilot.buildArgs({ ...input, binary: "copilot" })).toEqual(["-p", "do it", "-s", "--deny-tool", "shell"]);
  });

  it("codex runs read-only, skips the git check, and reads the prompt from stdin", () => {
    const codex = AI_PROVIDERS.find((p) => p.id === "openai")!.cli!;
    expect(codex.promptVia).toBe("stdin");
    expect(codex.buildArgs({ ...input, binary: "codex", viaStdin: true })).toEqual([
      "exec",
      "-s",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-",
    ]);
  });

  it("only claude supports agent options", () => {
    const supporting = AI_PROVIDERS.filter((p) => p.cli?.supportsAgentOpts).map((p) => p.id);
    expect(supporting).toEqual(["claude"]);
  });

  it("argv-delivery CLIs put the prompt in argv; stdin-capable ones leave it out when piped", () => {
    for (const def of AI_PROVIDERS) {
      const cli = def.cli;
      if (!cli) continue;
      const binary = cli.binaries[0]!;
      if (cli.promptVia === "argv") {
        expect(cli.buildArgs({ ...input, binary, viaStdin: false }), def.id).toContain("do it");
      }
      if (cli.promptVia === "stdin" || cli.stdinWhenShim) {
        expect(cli.buildArgs({ ...input, binary, viaStdin: true }), def.id).not.toContain("do it");
      }
    }
  });
});

describe("effort tiers", () => {
  const claudeCli = AI_PROVIDERS.find((p) => p.id === "claude")!;
  const codex = AI_PROVIDERS.find((p) => p.id === "openai")!;
  const base = { binary: "x", prompt: "p", viaStdin: false };

  it("claude CLI emits --model and --effort only when given", () => {
    expect(claudeCli.cli!.buildArgs({ ...base, model: "opus", effort: "high" })).toEqual([
      "-p",
      "p",
      "--model",
      "opus",
      "--effort",
      "high",
    ]);
    expect(claudeCli.cli!.buildArgs(base)).toEqual(["-p", "p"]);
  });

  it("codex puts -m and the effort config before the trailing stdin marker", () => {
    const args = codex.cli!.buildArgs({ ...base, viaStdin: true, model: "gpt-5", effort: "low" });
    expect(args.slice(-5)).toEqual(["-m", "gpt-5", "-c", "model_reasoning_effort=low", "-"]);
  });

  it("claude defaults map low/medium/high to haiku/sonnet/opus", () => {
    const get = (e: "low" | "medium" | "high") => tierFor(claudeCli, "cli", e, {});
    expect(get("low")).toMatchObject({ model: "haiku", effort: "low" });
    expect(get("medium")).toMatchObject({ model: "sonnet", effort: "medium" });
    expect(get("high")).toMatchObject({ model: "opus", effort: "high" });
  });

  it("user overrides win per field and blank falls back to the default", () => {
    const t = tierFor(claudeCli, "cli", "medium", { claude: { medium: { model: "opus", effort: "" } } });
    expect(t).toMatchObject({ model: "opus", effort: "medium", modelOverride: "opus", effortOverride: "" });
  });

  it("returns empty fields a mode cannot apply", () => {
    const gemini = AI_PROVIDERS.find((p) => p.id === "gemini")!;
    expect(tierFor(gemini, "api", "high", { gemini: { high: { effort: "high" } } }).effort).toBe("");
    expect(tierFor(AI_PROVIDERS.find((p) => p.id === "cursor")!, "cli", "low", {})).toMatchObject({
      model: "",
      effort: "",
    });
  });
});
