// React error boundaries do not catch errors in event handlers, timers, or
// promise rejections - which is the majority of real plugin bugs. These
// global handlers are the backstop, routing everything into the same
// logToHost sink the status bar reads from (see host/api/logging.ts), so
// "ALL exceptions anywhere" really does include uncaught event-handler
// throws and unhandled promise rejections, not just React render errors.
import { logToHost } from "../api/logging";

let installed = false;

export function registerGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : String(event.error ?? event.message);
    console.error("[global:onerror]", event.error ?? event.message);
    logToHost("error", message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
    console.error("[global:unhandledrejection]", event.reason);
    logToHost("error", message);
  });
}
