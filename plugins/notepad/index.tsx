/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useEffect, useRef, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";

const STORAGE_KEY = "content";
const AUTOSAVE_DEBOUNCE_MS = 1500;

export function activate(ctx: PluginContext) {
  ctx.api.log.info("notepad activated");
}

export function Component({ api }: { api: PluginApi }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.storage.get<string>(STORAGE_KEY).then((saved) => {
      setText(saved ?? "");
      setLoaded(true);
    });
  }, [api]);

  function onChange(value: string) {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.storage
        .set(STORAGE_KEY, value)
        .then(() => api.statusIcon.set("success", "saved"))
        .catch(() => api.statusIcon.set("error", "save failed"));
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function extractMemories() {
    setExtracting(true);
    api.statusIcon.set("in-progress", "asking claude...");
    try {
      const prompt =
        'Extract any durable facts, preferences, or reminders worth remembering from this note. ' +
        'Reply with a short bullet list, or exactly "Nothing worth remembering." if there is nothing notable.\n\n' +
        `Note:\n${text}`;
      const result = await api.shell.exec("claude", ["-p", prompt]);
      if (result.code === 0) {
        setExtractResult(result.stdout.trim());
        api.statusIcon.set("success", "extraction complete");
      } else {
        setExtractResult(`claude exited with code ${result.code}: ${result.stderr}`);
        api.statusIcon.set("error", "extraction failed");
      }
    } catch (err) {
      setExtractResult(String(err));
      api.statusIcon.set("error", "extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  if (!loaded) return <p>Loading...</p>;

  return (
    <div>
      <h2>Notepad</h2>
      <api.ui.TextBox value={text} onChange={onChange} rows={16} placeholder="Jot something down..." />
      <p>
        <button onClick={extractMemories} disabled={extracting || !text.trim()}>
          {extracting ? "Extracting..." : "Extract memories with Claude"}
        </button>
      </p>
      {extractResult && (
        <div>
          <h3>Extracted</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{extractResult}</pre>
        </div>
      )}
    </div>
  );
}
