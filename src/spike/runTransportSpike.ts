// Milestone 2a transport spike (dev-only). Validates: Rust reads a hand-written
// plugin module as text -> frontend wraps it in a Blob -> import()s the Blob URL
// -> the module's bare specifier resolves via the host document's import map.
// Reports back through a Rust command so the result is visible in the terminal
// running `tauri dev`, without needing to inspect the webview's devtools.
// Deleted once Milestone 2b's real loading pipeline supersedes it.
import { invoke } from "@tauri-apps/api/core";

export async function runTransportSpike(): Promise<void> {
  try {
    const source = await invoke<string>("spike_read_plugin_file", {
      relativePath: "plugins/_spike/index.js",
    });
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(/* @vite-ignore */ url);
      await invoke("spike_report", { result: `SUCCESS: ${mod.message}` });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    await invoke("spike_report", { result: `FAILURE: ${String(err)}` });
  }
}
