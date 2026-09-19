import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.CodeTextArea (CodeMirror-backed, palette-themed). */
export function TextAreaDemo({ api }: { api: PluginApi }) {
  const [code, setCode] = useState('{\n  "hello": "world"\n}');

  return (
    <div>
      <p>JSON editor, fixed 400x200 with word-wrap, syntax colors follow the active palette live:</p>
      <api.ui.CodeTextArea value={code} onChange={setCode} language="json" width={400} height={200} />
    </div>
  );
}
