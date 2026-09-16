import { useAppStore } from "../../host/state/appStore";
import { resolveModal } from "../../host/api/modals";
import { defaultPalette } from "../../shared/palette";

/** Host-rendered overlay, triggered via api.modal.* - not exposed to plugins
 * as a raw component (unlike StatusDot/TextBox). Rendered once at app root. */
export function Modal() {
  const request = useAppStore((s) => s.modalQueue[0]);
  if (!request) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: defaultPalette.surface,
          color: defaultPalette.text,
          padding: 20,
          borderRadius: 8,
          minWidth: 300,
          maxWidth: 480,
        }}
      >
        <h3 style={{ marginTop: 0 }}>{request.title}</h3>
        <p>{request.message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {(request.kind === "error" || request.kind === "info") && (
            <button onClick={() => resolveModal(request.id, undefined)}>OK</button>
          )}
          {request.kind === "confirm" && (
            <>
              <button onClick={() => resolveModal(request.id, false)}>{request.cancelLabel}</button>
              <button onClick={() => resolveModal(request.id, true)}>{request.confirmLabel}</button>
            </>
          )}
          {request.kind === "question" &&
            request.buttons?.map((label) => (
              <button key={label} onClick={() => resolveModal(request.id, label)}>
                {label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
