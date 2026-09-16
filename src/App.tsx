import { useEffect } from "react";
import { usePluginRegistry } from "./host/loader/usePluginRegistry";
import { PluginErrorBoundary } from "./host/errors/PluginErrorBoundary";
import { registerGlobalErrorHandlers } from "./host/errors/globalErrorHandlers";
import "./App.css";

// Milestone 2b: no Sidebar/StatusBar yet (Milestone 3) - just prove plugins
// discover, load via Blob URL, hot-reload, and are isolated by error boundaries.
function App() {
  useEffect(() => {
    registerGlobalErrorHandlers();
  }, []);

  const { entries, discoveryErrors, safeMode } = usePluginRegistry();

  return (
    <main style={{ padding: 16 }}>
      <h1>stewrd</h1>
      {safeMode && (
        <p style={{ color: "#a60" }}>
          SAFE_MODE active - no plugins loaded. Delete the SAFE_MODE file in the app-data plugins directory to
          resume normal loading.
        </p>
      )}
      {discoveryErrors.map((e) => (
        <p key={e.dir} style={{ color: "#c33" }}>
          Plugin "{e.dir}" failed to load: {e.message}
        </p>
      ))}
      <div id="plugin-content">
        {entries.map((entry) => (
          <PluginErrorBoundary key={`${entry.manifest.id}:${entry.generation}`} pluginId={entry.manifest.id}>
            {entry.loadError ? (
              <p style={{ color: "#c33" }}>
                Plugin "{entry.manifest.id}" failed to load/activate: {entry.loadError}
              </p>
            ) : (
              <entry.Component />
            )}
          </PluginErrorBoundary>
        ))}
      </div>
    </main>
  );
}

export default App;
