import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { SettingsGeneral } from "./SettingsGeneral";
import { SettingsCategories } from "./SettingsCategories";
import { SettingsThemes } from "./SettingsThemes";
import { SettingsPlugins } from "./SettingsPlugins";
import { SettingsAi } from "./SettingsAi";
import { SettingsHelp } from "./SettingsHelp";
import { SettingsVersion } from "./SettingsVersion";
import { scrollbarStyle } from "../../components/shared/styles";

type SettingsTab = "general" | "categories" | "themes" | "plugins" | "ai" | "help" | "version";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categories" },
  { id: "themes", label: "Themes" },
  { id: "plugins", label: "Plugins" },
  { id: "ai", label: "AI" },
  { id: "help", label: "Help" },
  { id: "version", label: "Version" },
];

export function SettingsPage() {
  const palette = useAppStore((s) => s.palette);
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <h2 style={{ marginTop: 0, flexShrink: 0 }}>Settings</h2>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${palette.border}`, marginBottom: 16, flexShrink: 0 }}>
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
      <div data-testid="settings-content" style={{ flex: 1, minHeight: 0, overflowY: "auto", ...scrollbarStyle(palette) }}>
        {tab === "general" && <SettingsGeneral />}
        {tab === "categories" && <SettingsCategories />}
        {tab === "themes" && <SettingsThemes />}
        {tab === "plugins" && <SettingsPlugins />}
        {tab === "ai" && <SettingsAi />}
        {tab === "help" && <SettingsHelp />}
        {tab === "version" && <SettingsVersion />}
      </div>
    </div>
  );
}
