import { useAppStore } from "../state/appStore";
import type { StatusColor } from "../../shared/palette";

let nextToastId = 1;

export interface ToastApi {
  show(opts: { message: string; kind?: StatusColor; durationMs?: number }): void;
}

export function createToastApi(): ToastApi {
  return {
    show(opts) {
      const id = nextToastId++;
      const durationMs = opts.durationMs ?? 3000;
      useAppStore.getState().pushToast({ id, message: opts.message, kind: opts.kind ?? "idle", durationMs });
      setTimeout(() => useAppStore.getState().dismissToast(id), durationMs);
    },
  };
}
