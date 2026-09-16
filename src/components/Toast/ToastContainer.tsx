import { useAppStore } from "../../host/state/appStore";
import { defaultPalette } from "../../shared/palette";

/** Host-rendered overlay, triggered via api.toast.show - rendered once at app root. */
export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 40,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: defaultPalette.surface,
            color: defaultPalette.status[t.kind],
            border: `1px solid ${defaultPalette.border}`,
            borderRadius: 6,
            padding: "8px 12px",
            minWidth: 200,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
