// Assembles the full PluginApi + PluginContext for one plugin activation.
//
// Generation tokens: `ctx.onDispose`/AbortSignal are enforcement aids, not
// guarantees - an in-flight promise created before deactivation can still
// resolve after it. currentGeneration tracks the latest activation per
// pluginId; statusIcon/log/toast calls from a stale (superseded) context are
// dropped instead of mutating shared host state after teardown. storage/
// shell/fs/modal are not guarded this way - the AbortSignal is the intended
// cancellation mechanism for those (per docs/architecture-plan.md).
import { createFsApi } from "./fs";
import { createLogApi, logToHost } from "./logging";
import { createModalApi } from "./modals";
import { createShellApi } from "./shell";
import { createStatusIconApi } from "./statusIcon";
import { createStorageApi } from "./storage";
import { createThemeApi } from "./theme";
import { createToastApi } from "./toast";
import { StatusDot } from "../../components/StatusDot/StatusDot";
import { TextBox } from "../../components/TextBox/TextBox";
import { tickScheduler, type TickHandle } from "../scheduler/tickScheduler";
import type { PluginApi, PluginContext } from "../../shared/plugin-api.d.ts";

const currentGeneration = new Map<string, number>();

function isCurrent(pluginId: string, generation: number): boolean {
  return currentGeneration.get(pluginId) === generation;
}

function guardVoid<A extends unknown[]>(pluginId: string, generation: number, fn: (...args: A) => void) {
  return (...args: A) => {
    if (!isCurrent(pluginId, generation)) return;
    fn(...args);
  };
}

export interface CreatedPluginContext {
  ctx: PluginContext;
  tickHandle: TickHandle & { readonly entryId: number };
  abortController: AbortController;
}

export function createPluginContext(pluginId: string, generation: number): CreatedPluginContext {
  currentGeneration.set(pluginId, generation);
  const abortController = new AbortController();

  const statusIconBase = createStatusIconApi(pluginId);
  const logBase = createLogApi(pluginId);
  const toastBase = createToastApi();

  const tickHandle = tickScheduler.createHandle({
    onError: (err) => logToHost("error", `tick handler error: ${String(err)}`, pluginId),
    onWatchdogTimeout: () => {
      logToHost("warning", "tick handler exceeded its watchdog timeout", pluginId);
      statusIconBase.set("warning", "tick handler is slow/hung");
    },
  });

  const api: PluginApi = {
    theme: createThemeApi(),
    statusIcon: {
      set: guardVoid(pluginId, generation, statusIconBase.set),
      get: statusIconBase.get,
    },
    modal: createModalApi(),
    toast: { show: guardVoid(pluginId, generation, toastBase.show) },
    ui: { TextBox, StatusDot },
    shell: createShellApi(),
    storage: createStorageApi(pluginId),
    fs: createFsApi(pluginId),
    log: {
      info: guardVoid(pluginId, generation, logBase.info),
      warn: guardVoid(pluginId, generation, logBase.warn),
      error: guardVoid(pluginId, generation, logBase.error),
    },
  };

  const ctx: PluginContext = { api, tick: tickHandle, pluginId, signal: abortController.signal };
  return { ctx, tickHandle, abortController };
}

export function destroyPluginContext(created: CreatedPluginContext): void {
  created.abortController.abort();
  tickScheduler.destroyHandle(created.tickHandle);
}
