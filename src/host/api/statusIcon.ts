import { useAppStore } from "../state/appStore";
import { findLeaf } from "../state/paneTree";
import type { StatusColor } from "../../shared/palette";

export interface StatusIconApi {
  /** Sets the status for one `source` (default `"default"`). A plugin with
   * several independent activities gives each its own source; the sidebar
   * icon shows the worst across them (error > warning > in-progress > success
   * > idle). A `success` is held until the app and this plugin are focused,
   * then fades to idle 3s later. */
  set(color: StatusColor, tooltip?: string, source?: string): void;
  /** The effective (worst-of-all-sources) status. */
  get(): StatusColor;
}

const DEFAULT_SOURCE = "default";
const SUCCESS_HOLD_MS = 3000;
/** Lowest to highest priority. */
const ORDER: StatusColor[] = ["idle", "success", "in-progress", "warning", "error"];

interface SourceState {
  color: StatusColor;
  tooltip?: string;
}
interface PluginState {
  sources: Map<string, SourceState>;
  timer?: ReturnType<typeof setTimeout>;
}

const states = new Map<string, PluginState>();

function isFocused(pluginId: string): boolean {
  const s = useAppStore.getState();
  if (s.view !== "plugin" || !document.hasFocus()) return false;
  return findLeaf(s.paneTree, s.activePaneId)?.pluginId === pluginId;
}

function apply(pluginId: string, state: PluginState): void {
  let worst: SourceState = { color: "idle" };
  for (const s of state.sources.values()) {
    if (ORDER.indexOf(s.color) > ORDER.indexOf(worst.color)) worst = s;
  }
  useAppStore.getState().setPluginStatus(pluginId, worst.color, worst.tooltip);
}

/** (Re)starts or cancels the 3s countdown: it only runs while some source is
 * `success` AND the app and the plugin are both focused. */
function schedule(pluginId: string, state: PluginState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  const hasSuccess = [...state.sources.values()].some((s) => s.color === "success");
  if (!hasSuccess || !isFocused(pluginId)) return;
  state.timer = setTimeout(() => {
    state.timer = undefined;
    for (const s of state.sources.values()) {
      if (s.color === "success") {
        s.color = "idle";
        s.tooltip = undefined;
      }
    }
    apply(pluginId, state);
  }, SUCCESS_HOLD_MS);
}

function rescheduleAll(): void {
  for (const [pluginId, state] of states) schedule(pluginId, state);
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", rescheduleAll);
  window.addEventListener("blur", rescheduleAll);
  // Moving between plugins/panes or into Settings changes which plugin is focused.
  useAppStore.subscribe((s, prev) => {
    if (s.activePaneId !== prev.activePaneId || s.view !== prev.view || s.paneTree !== prev.paneTree) rescheduleAll();
  });
}

/** Called once per activation. Sources reported by a previous generation are
 * dropped (a hot-reloaded plugin starts clean) but the icon itself keeps its
 * current color until the new generation sets one, as before. */
export function createStatusIconApi(pluginId: string): StatusIconApi {
  const previous = states.get(pluginId);
  if (previous?.timer) clearTimeout(previous.timer);
  const state: PluginState = { sources: new Map() };
  states.set(pluginId, state);

  return {
    set(color, tooltip, source = DEFAULT_SOURCE) {
      state.sources.set(source, { color, tooltip });
      apply(pluginId, state);
      schedule(pluginId, state);
    },
    get() {
      return useAppStore.getState().plugins[pluginId]?.status ?? "idle";
    },
  };
}
