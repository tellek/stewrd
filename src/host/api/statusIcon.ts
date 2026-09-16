import { useAppStore } from "../state/appStore";
import type { StatusColor } from "../../shared/palette";

export interface StatusIconApi {
  set(color: StatusColor, tooltip?: string): void;
  get(): StatusColor;
}

export function createStatusIconApi(pluginId: string): StatusIconApi {
  return {
    set(color, tooltip) {
      useAppStore.getState().setPluginStatus(pluginId, color, tooltip);
    },
    get() {
      return useAppStore.getState().plugins[pluginId]?.status ?? "idle";
    },
  };
}
