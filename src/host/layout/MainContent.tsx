import { useAppStore } from "../state/appStore";
import { PluginErrorBoundary } from "../errors/PluginErrorBoundary";
import type { PluginRegistryEntry } from "../loader/usePluginRegistry";
import { defaultPalette } from "../../shared/palette";

export function MainContent({
  entries,
  onReload,
}: {
  entries: PluginRegistryEntry[];
  onReload: (pluginId: string) => void;
}) {
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
      {!active && <p style={{ color: defaultPalette.textMuted }}>Select a plugin from the sidebar.</p>}
      {active &&
        (active.loadError || !active.api ? (
          <p style={{ color: defaultPalette.status.error }}>
            Plugin "{active.manifest.id}" failed to load/activate: {active.loadError}
          </p>
        ) : (
          <PluginErrorBoundary
            key={`${active.manifest.id}:${active.generation}`}
            pluginId={active.manifest.id}
            onReload={() => onReload(active.manifest.id)}
          >
            <active.Component api={active.api} />
          </PluginErrorBoundary>
        ))}
    </main>
  );
}
