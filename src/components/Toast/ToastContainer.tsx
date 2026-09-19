import { useAppStore } from "../../host/state/appStore";

/** Host-rendered overlay, triggered via api.toast.show - rendered once at app root. */
export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const palette = useAppStore((s) => s.palette);
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
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: palette.surface,
            color: palette.text,
            border: `1px solid ${palette.status[t.kind]}`,
            borderRadius: 6,
            padding: "8px 12px",
            minWidth: 200,
          }}
        >
          <div style={{ flex: 1 }}>
            {t.title && <div style={{ fontWeight: 600, color: palette.status[t.kind] }}>{t.title}</div>}
            <div>{t.message}</div>
          </div>
          <button
            onClick={() => useAppStore.getState().dismissToast(t.id)}
            aria-label="Dismiss"
            title="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: palette.textMuted,
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
