import { useAppStore } from "../state/appStore";
import type { StatusColor } from "../../shared/palette";

let nextToastId = 1;

/** How long the fade-out transition takes once a toast starts dismissing -
 * must match the transition duration ToastContainer applies to opacity. */
const FADE_MS = 1000;

export interface ToastApi {
  show(opts: { title?: string; message: string; kind?: StatusColor; durationMs?: number }): void;
}

export function createToastApi(): ToastApi {
  return {
    show(opts) {
      const id = nextToastId++;
      const durationMs = opts.durationMs ?? 3000;
      useAppStore
        .getState()
        .pushToast({ id, title: opts.title, message: opts.message, kind: opts.kind ?? "idle", durationMs });
      setTimeout(() => {
        useAppStore.getState().fadeToast(id);
        setTimeout(() => useAppStore.getState().dismissToast(id), FADE_MS);
      }, durationMs);
    },
  };
}

/** Fades then removes a toast immediately (e.g. from a manual dismiss click)
 * instead of waiting for its full `durationMs`. */
export function dismissToastNow(id: number) {
  useAppStore.getState().fadeToast(id);
  setTimeout(() => useAppStore.getState().dismissToast(id), FADE_MS);
}
