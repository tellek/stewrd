import { useEffect } from "react";
import { usePluginRegistry } from "./host/loader/usePluginRegistry";
import { registerGlobalErrorHandlers } from "./host/errors/globalErrorHandlers";
import { useAppStore } from "./host/state/appStore";
import { Sidebar } from "./host/layout/Sidebar";
import { MainContent } from "./host/layout/MainContent";
import { StatusBar } from "./host/layout/StatusBar";
import { Modal } from "./components/Modal/Modal";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { defaultPalette } from "./shared/palette";
import "./App.css";

function App() {
  useEffect(() => {
    registerGlobalErrorHandlers();
  }, []);

  const { entries, discoveryErrors, safeMode, reloadPlugin, ensureLoaded } = usePluginRegistry();
  const setPlugins = useAppStore((s) => s.setPlugins);
  const setPluginStatus = useAppStore((s) => s.setPluginStatus);
  const logMessage = useAppStore((s) => s.logMessage);
  const activePluginId = useAppStore((s) => s.activePluginId);

  useEffect(() => {
    if (activePluginId) ensureLoaded(activePluginId);
  }, [activePluginId, ensureLoaded]);

  useEffect(() => {
    setPlugins(entries.map((e) => ({ manifest: e.manifest, status: "idle" })));
    for (const e of entries) {
      if (e.loadError) {
        setPluginStatus(e.manifest.id, "error");
        logMessage("error", `Plugin "${e.manifest.id}" failed to load/activate: ${e.loadError}`, e.manifest.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    for (const e of discoveryErrors) {
      logMessage("error", `Plugin "${e.dir}" failed discovery: ${e.message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryErrors]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {safeMode && (
        <p style={{ color: defaultPalette.status.warning, padding: "4px 12px", margin: 0 }}>
          SAFE_MODE active - no plugins loaded. Delete the SAFE_MODE file in the app-data plugins directory to resume
          normal loading.
        </p>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar />
        <MainContent entries={entries} onReload={reloadPlugin} />
      </div>
      <StatusBar />
      <Modal />
      <ToastContainer />
    </div>
  );
}

export default App;
