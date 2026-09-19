import { useState } from "react";
import { useAppStore, type ModalRequest } from "../../host/state/appStore";
import { resolveModal } from "../../host/api/modals";
import { TextButton } from "../TextButton/TextButton";
import { controlBase, scrimColor } from "../shared/styles";
import type { Palette } from "../../shared/palette";

/** "prompt" kind's text input, extracted into its own component and keyed by
 * request.id (see Modal() below) so its local input state resets per
 * request instead of leaking one prompt's typed text into the next, and so
 * Modal() itself doesn't call useState after its early `!request` return
 * (which would break the rules of hooks). */
function PromptModal({ request, palette }: { request: ModalRequest; palette: Palette }) {
  const [value, setValue] = useState(request.initialValue ?? "");

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{request.title}</h3>
      <p>{request.message}</p>
      <input
        autoFocus
        value={value}
        maxLength={request.maxLength}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) resolveModal(request.id, value.trim());
        }}
        style={{ ...controlBase(palette), width: "100%", padding: "6px 8px", marginBottom: 12 }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <TextButton label="Cancel" onClick={() => resolveModal(request.id, null)} />
        <TextButton
          label="Save"
          variant="primary"
          disabled={!value.trim()}
          onClick={() => resolveModal(request.id, value.trim())}
        />
      </div>
    </>
  );
}

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
        {request.kind === "prompt" ? (
          <PromptModal key={request.id} request={request} palette={palette} />
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>{request.title}</h3>
            <p>{request.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {(request.kind === "error" || request.kind === "info") && (
                <TextButton label="OK" variant="primary" onClick={() => resolveModal(request.id, undefined)} />
              )}
              {request.kind === "confirm" && (
                <>
                  <TextButton
                    label={request.cancelLabel ?? "Cancel"}
                    onClick={() => resolveModal(request.id, false)}
                  />
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
          </>
        )}
      </div>
    </div>
  );
}
