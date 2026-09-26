import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePluginRegistry } from "./host/loader/usePluginRegistry";
import { registerGlobalErrorHandlers } from "./host/errors/globalErrorHandlers";
import { useAppStore } from "./host/state/appStore";
import { collectPaneToolIds } from "./host/state/paneTree";
import { Sidebar } from "./host/layout/Sidebar";
import { MainContent } from "./host/layout/MainContent";
import { StatusBar } from "./host/layout/StatusBar";
import { Modal } from "./components/Modal/Modal";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { worstStatus } from "./host/layout/categoryStatus";
import { computeBadgeIcon, applyOverlayIcon } from "./host/taskbarBadge";
import "./App.css";

function App() {
  useEffect(() => {
    registerGlobalErrorHandlers();
  }, []);

  // NOTE: do not intercept the window's close-requested event here. A previous
  // attempt preventDefault()'d it to flush pending hostSettings writes and then
  // called window.destroy() - but `core:window:allow-destroy` is not part of
  // Tauri's default window permission set, so destroy() was rejected by the ACL
  // and the window became impossible to close. Losing a hostSettings write made
  // microseconds before quit is a far smaller problem than an unclosable app.
  const { entries, discoveryErrors, safeMode, reloadPlugin, ensureLoaded } = usePluginRegistry();
  const setPlugins = useAppStore((s) => s.setPlugins);
  const setPluginStatus = useAppStore((s) => s.setPluginStatus);
  const logMessage = useAppStore((s) => s.logMessage);
  const paneTree = useAppStore((s) => s.paneTree);
  const palette = useAppStore((s) => s.palette);
  const hostSettingsLoaded = useAppStore((s) => s.hostSettingsLoaded);
  const hydrateHostSettings = useAppStore((s) => s.hydrateHostSettings);
  const loadCategoryIcons = useAppStore((s) => s.loadCategoryIcons);
  const hydrateStatusLog = useAppStore((s) => s.hydrateStatusLog);
  const appendRemoteLogLine = useAppStore((s) => s.appendRemoteLogLine);
  // Selecting just the derived status string (not the whole `plugins`
  // object) matters here: zustand's default equality check then skips
  // re-rendering App when plugin metadata changes without the worst status
  // actually changing. Selecting the raw `plugins` object previously caused
  // an infinite loop - App re-rendering on every setPlugins call recomputed
  // usePluginRegistry's `entries` array (a fresh Object.values() each time),
  // which re-fired the entries effect below, which called setPlugins again.
  const worstPluginStatus = useAppStore((s) => worstStatus(Object.values(s.plugins)));
  const taskbarBadgeThreshold = useAppStore((s) => s.taskbarBadgeThreshold);

  useEffect(() => {
    hydrateHostSettings();
    loadCategoryIcons();
    hydrateStatusLog().then(() => logMessage("idle", "Stewrd started and ready"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rust-originated log lines (wrapped command errors, panics - see
  // commands/logged.rs / lib.rs's panic hook) arrive here live, separately
  // from hydrateStatusLog's on-mount disk read.
  useEffect(() => {
    const unlistenPromise = listen<string>("log-line", (event) => appendRemoteLogLine(event.payload));
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Depend on a stable joined string, not the fresh array collectPaneToolIds
  // returns every render - App.tsx has a documented history of an infinite
  // reload loop from exactly that "new array/object each render" shape (see
  // the worstPluginStatus comment above).
  const paneToolIdsKey = [...new Set(collectPaneToolIds(paneTree))].join("|");
  useEffect(() => {
    for (const id of paneToolIdsKey ? paneToolIdsKey.split("|") : []) ensureLoaded(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneToolIdsKey, ensureLoaded]);

  useEffect(() => {
    setPlugins(entries.map((e) => ({ manifest: e.manifest, status: "idle", dir: e.dir, category: e.category })));
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

  const badgeRequestRef = useRef(0);
  useEffect(() => {
    const requestId = ++badgeRequestRef.current;
    computeBadgeIcon(worstPluginStatus, taskbarBadgeThreshold, palette).then((bytes) => {
      // Discard if a newer status change has already superseded this one -
      // the async canvas rendering can let calls resolve out of order.
      if (requestId !== badgeRequestRef.current) return;
      applyOverlayIcon(bytes);
    });
  }, [worstPluginStatus, taskbarBadgeThreshold, palette]);

  if (!hostSettingsLoaded) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {safeMode && (
        <p style={{ color: palette.status.warning, padding: "4px 12px", margin: 0 }}>
          SAFE_MODE active - no plugins loaded. Delete the SAFE_MODE file in the app-data root directory (not the
          plugins subfolder) to resume normal loading.
        </p>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <MainContent entries={entries} onReload={reloadPlugin} />
          <StatusBar />
        </div>
      </div>
      <Modal />
      <ToastContainer />
    </div>
  );
}

export default App;
