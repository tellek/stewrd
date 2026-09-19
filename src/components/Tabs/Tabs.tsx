import type { TabsProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

/** Plugin-facing primitive, exposed via api.ui.Tabs. */
export function Tabs({ tabs, value, onChange }: TabsProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${palette.border}` }}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? palette.accent : "transparent"}`,
              color: active ? palette.text : palette.textMuted,
              padding: "8px 14px",
              fontFamily: "inherit",
              fontSize: "inherit",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
