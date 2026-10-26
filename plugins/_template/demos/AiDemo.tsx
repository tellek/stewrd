import { useRef, useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates ctx.api.ai.run - the single launch point for headless AI
 * invocations in this app. Streams the response live via onStdout, and
 * supports cancelling an in-flight request. */
export function AiDemo({ api }: { api: PluginApi }) {
  const [prompt, setPrompt] = useState("In one short sentence, what is a Tauri app?");
  const [output, setOutput] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const killRef = useRef<(() => void) | null>(null);

  async function ask() {
    setAsking(true);
    setOutput("");
    setError(null);
    // effort picks Low/Medium/High; the user decides in Settings > AI which
    // model and reasoning level each one means for their provider.
    const handle = api.ai.run(prompt, {
      effort: "low",
      onStdout: (chunk) => setOutput((prev) => prev + chunk),
    });
    killRef.current = handle.kill;
    try {
      await handle.done;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      killRef.current = null;
      setAsking(false);
    }
  }

  function cancel() {
    killRef.current?.();
  }

  return (
    <div>
      <p>
        Calls <code>api.ai.run(prompt)</code> - same shared surface Settings&apos; palette-from-media generator and
        git-tracker&apos;s &quot;Ask Claude&quot; go through. Which provider answers (Claude, OpenAI, Gemini, Copilot, Cursor, Grok, OpenCode or a
        custom endpoint, as a CLI or an API key) is chosen by the user in Settings &gt; AI, not by this plugin.
        <code>allowedTools</code>/<code>disallowedTools</code>/<code>extraArgs</code> work only under the Claude CLI
        provider - under any other provider, passing one makes this reject with a clear error instead of silently
        doing nothing.
      </p>
      <api.ui.TextBox value={prompt} onChange={setPrompt} rows={2} placeholder="Ask something..." />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={ask} disabled={asking}>
          {asking ? "Asking..." : "Ask"}
        </button>
        <button onClick={cancel} disabled={!asking}>
          Cancel
        </button>
      </div>
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}
      {output && <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>}
    </div>
  );
}
