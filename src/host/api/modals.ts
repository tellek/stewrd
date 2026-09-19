import { useAppStore, type ModalRequest } from "../state/appStore";

let nextModalId = 1;
const resolvers = new Map<number, (result: unknown) => void>();

function enqueue(kind: ModalRequest["kind"], base: Omit<ModalRequest, "id" | "kind">): Promise<unknown> {
  return new Promise((resolve) => {
    const id = nextModalId++;
    resolvers.set(id, resolve);
    useAppStore.getState().pushModal({ id, kind, ...base });
  });
}

/** Called by components/Modal/Modal.tsx when the user picks a button. */
export function resolveModal(id: number, result: unknown): void {
  resolvers.get(id)?.(result);
  resolvers.delete(id);
  useAppStore.getState().dismissModal(id);
}

export interface ModalApi {
  error(opts: { title: string; message: string }): Promise<void>;
  info(opts: { title: string; message: string }): Promise<void>;
  question(opts: { title: string; message: string; buttons: string[] }): Promise<string>;
  confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>;
}

/** Host-only - not part of the plugin-facing ModalApi below. Used by
 * SidebarLayouts.tsx to name a saved pane layout. Resolves `null` on cancel. */
export function promptModal(opts: { title: string; message: string; maxLength?: number }): Promise<string | null> {
  return enqueue("prompt", {
    title: opts.title,
    message: opts.message,
    maxLength: opts.maxLength,
  }) as Promise<string | null>;
}

export function createModalApi(): ModalApi {
  return {
    error: (opts) => enqueue("error", { title: opts.title, message: opts.message }).then(() => undefined),
    info: (opts) => enqueue("info", { title: opts.title, message: opts.message }).then(() => undefined),
    question: (opts) =>
      enqueue("question", { title: opts.title, message: opts.message, buttons: opts.buttons }) as Promise<string>,
    confirm: (opts) =>
      enqueue("confirm", {
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? "Confirm",
        cancelLabel: opts.cancelLabel ?? "Cancel",
      }) as Promise<boolean>,
  };
}
