import { useAppStore } from "../../host/state/appStore";
import { resolveModal } from "../../host/api/modals";
import { TextButton } from "../TextButton/TextButton";
import { scrimColor } from "../shared/styles";

/** Host-rendered overlay, triggered via api.modal.* - not exposed to plugins
 * as a raw component (unlike StatusDot/TextBox). Rendered once at app root. */
export function Modal() {
  const request = useAppStore((s) => s.modalQueue[0]);
  const palette = useAppStore((s) => s.palette);
  if (!request) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: scrimColor(palette),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: palette.surface,
          color: palette.text,
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
            <TextButton label="OK" variant="primary" onClick={() => resolveModal(request.id, undefined)} />
          )}
          {request.kind === "confirm" && (
            <>
              <TextButton label={request.cancelLabel ?? "Cancel"} onClick={() => resolveModal(request.id, false)} />
              <TextButton
                label={request.confirmLabel ?? "Confirm"}
                variant="primary"
                onClick={() => resolveModal(request.id, true)}
              />
            </>
          )}
          {request.kind === "question" &&
            request.buttons?.map((label) => (
              <TextButton key={label} label={label} onClick={() => resolveModal(request.id, label)} />
            ))}
        </div>
      </div>
    </div>
  );
}
