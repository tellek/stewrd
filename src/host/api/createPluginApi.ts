// Assembles the full PluginApi + PluginContext for one plugin activation.
//
// Generation tokens: an in-flight promise created before deactivation can
// still resolve after it, and a plugin can capture references before
// teardown - ctx.onDispose/AbortSignal are enforcement aids, not guarantees.
// currentGeneration tracks the latest activation per pluginId; statusIcon/
// log/toast calls made by a stale (superseded) context THROW instead of
// silently mutating shared host state after teardown, so a lingering async
// callback fails loudly rather than quietly corrupting live state. storage/
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
    if (!isCurrent(pluginId, generation)) {
      throw new Error(`[plugin:${pluginId}] api call after deactivation`);
    }
    fn(...args);
  };
}

export interface CreatedPluginContext {
  ctx: PluginContext;
  tickHandle: TickHandle & { readonly entryId: number };
  abortController: AbortController;
  disposeBag: Array<() => void>;
  pluginId: string;
  generation: number;
}

export function createPluginContext(pluginId: string, generation: number): CreatedPluginContext {
  currentGeneration.set(pluginId, generation);
  const abortController = new AbortController();
  const disposeBag: Array<() => void> = [];

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

  const ctx: PluginContext = {
    api,
    tick: tickHandle,
    pluginId,
    signal: abortController.signal,
    onDispose: (fn) => {
      disposeBag.push(fn);
    },
  };

  return { ctx, tickHandle, abortController, disposeBag, pluginId, generation };
}

export function destroyPluginContext(created: CreatedPluginContext): void {
  for (const fn of created.disposeBag) {
    try {
      fn();
    } catch (err) {
      console.error("[plugin] onDispose callback threw", err);
    }
  }
  created.abortController.abort();
  tickScheduler.destroyHandle(created.tickHandle);
  // Only clear if no newer generation has already taken over (hot reload
  // creates the new context before the old one is torn down in some paths).
  if (currentGeneration.get(created.pluginId) === created.generation) {
    currentGeneration.delete(created.pluginId);
  }
}
