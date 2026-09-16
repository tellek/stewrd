import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/appStore";
import type { StatusColor } from "../../shared/palette";

/** Central sink for both host-internal messages and plugin api.log calls:
 * pushes to the in-memory ring buffer (StatusBar) and persists a line to the
 * rolling app-data log file. Shell/process output is never routed through
 * here automatically (may contain secrets) - only explicit log calls. */
export function logToHost(level: StatusColor, message: string, pluginId?: string): void {
  useAppStore.getState().logMessage(level, message, pluginId);
  const line = JSON.stringify({ ts: Date.now(), level, pluginId, message });
  invoke("append_log_line", { line }).catch((err) => console.error("[logging] failed to persist log line", err));
}

export interface LogApi {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogApi(pluginId: string): LogApi {
  return {
    info: (msg) => logToHost("idle", msg, pluginId),
    warn: (msg) => logToHost("warning", msg, pluginId),
    error: (msg) => logToHost("error", msg, pluginId),
  };
}
