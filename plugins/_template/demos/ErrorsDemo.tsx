import { useState } from "react";

/** Demonstrates that ALL exceptions - not just ones a plugin explicitly logs
 * via api.log.error - end up in the host's status bar (the bar at the
 * bottom of the app) and its on-disk log file. Throwing inside a click
 * handler is not caught by a React error boundary (that only catches
 * render/lifecycle errors) - it's caught by the host's global
 * window.onerror/unhandledrejection handlers instead, which route into the
 * same sink. Clicking either button below is safe: it only crashes this
 * demo's own tiny bit of work, not the app. */
export function ErrorsDemo() {
  const [thrown, setThrown] = useState(0);

  function throwInEventHandler() {
    setThrown((n) => n + 1);
    throw new Error(`Demo error thrown from a click handler (#${thrown + 1}) - check the status bar at the bottom.`);
  }

  async function rejectUnhandled() {
    setThrown((n) => n + 1);
    // Deliberately not awaited/caught - this is exactly the "fire and forget"
    // shape that would otherwise silently swallow an error.
    void Promise.reject(new Error("Demo unhandled promise rejection - also lands in the status bar."));
  }

  return (
    <div>
      <p>
        These buttons deliberately throw/reject to demonstrate that ALL exceptions - anywhere in a plugin, not just
        explicit <code>api.log.error()</code> calls - are automatically routed into the status bar at the bottom of
        the app (and persisted to its on-disk log file). Nothing special needs to be added inside a tool/handler for
        this to work.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={throwInEventHandler}>Throw From Click Handler</button>
        <button onClick={rejectUnhandled}>Reject Unhandled Promise</button>
      </div>
    </div>
  );
}
