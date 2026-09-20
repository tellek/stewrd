import { useRef, useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates ctx.api.ai.run - the single launch point for headless AI CLI
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
    const handle = api.ai.run(prompt, {
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
        Calls <code>api.ai.run(prompt)</code> - this shells out to the <code>claude</code> CLI headlessly, same as
        Settings&apos; palette-from-media generator and git-tracker&apos;s &quot;Ask Claude&quot;, all going through
        this one shared surface.
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
