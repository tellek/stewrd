// React error boundaries do not catch errors in event handlers, timers, or
// promise rejections - which is the majority of real plugin bugs. These
// global handlers are the backstop. Full status-bar/persistent-log routing
// lands in Milestone 3/4; for now they log to console with clear attribution
// so Milestone 2b's exit criteria ("global handlers confirmed catching a
// deliberate throw") can be verified.
let installed = false;

export function registerGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    console.error("[global:onerror]", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[global:unhandledrejection]", event.reason);
  });
}
