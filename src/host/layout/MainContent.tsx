import { useAppStore } from "../state/appStore";
import { PluginErrorBoundary } from "../errors/PluginErrorBoundary";
import type { PluginRegistryEntry } from "../loader/usePluginRegistry";
import { SettingsPage } from "./SettingsPage";
import { defaultPalette } from "../../shared/palette";

export function MainContent({
  entries,
  onReload,
}: {
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
  const view = useAppStore((s) => s.view);
  const activePluginId = useAppStore((s) => s.activePluginId);
  const active = entries.find((e) => e.manifest.id === activePluginId);

  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        background: defaultPalette.background,
        color: defaultPalette.text,
        padding: 16,
      }}
    >
      {view === "settings" && <SettingsPage />}
      {view === "plugin" && !active && (
        <p style={{ color: defaultPalette.textMuted }}>Select a plugin from the sidebar.</p>
      )}
      {view === "plugin" && active && !active.loaded && !active.loadError && (
        <p style={{ color: defaultPalette.textMuted }}>Loading "{active.manifest.name}"...</p>
      )}
      {view === "plugin" &&
        active &&
        (active.loadError ? (
          <p style={{ color: defaultPalette.status.error }}>
            Plugin "{active.manifest.id}" failed to load/activate: {active.loadError}
          </p>
        ) : active.loaded && active.api ? (
          <PluginErrorBoundary
            key={`${active.manifest.id}:${active.generation}`}
            pluginId={active.manifest.id}
            onReload={() => onReload(active.manifest.id)}
          >
            <active.Component api={active.api} />
          </PluginErrorBoundary>
        ) : null)}
    </main>
  );
}
