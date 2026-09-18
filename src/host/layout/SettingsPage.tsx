import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { SettingsGeneral } from "./SettingsGeneral";
import { SettingsCategories } from "./SettingsCategories";
import { SettingsThemes } from "./SettingsThemes";
import { SettingsPlugins } from "./SettingsPlugins";

type SettingsTab = "general" | "categories" | "themes" | "plugins";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categories" },
  { id: "themes", label: "Themes" },
  { id: "plugins", label: "Plugins" },
];

export function SettingsPage() {
  const palette = useAppStore((s) => s.palette);
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${palette.border}`, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 14px",
              border: "none",
              borderBottom: tab === t.id ? `2px solid ${palette.accent}` : "2px solid transparent",
              background: "transparent",
              color: tab === t.id ? palette.text : palette.textMuted,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" && <SettingsGeneral />}
      {tab === "categories" && <SettingsCategories />}
      {tab === "themes" && <SettingsThemes />}
      {tab === "plugins" && <SettingsPlugins />}
    </div>
  );
}
