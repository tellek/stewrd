import { useEffect, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../state/appStore";

export function SettingsGeneral() {
  const palette = useAppStore((s) => s.palette);
  const [name, setName] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getName(), getVersion()])
      .then(([n, v]) => {
        setName(n);
        setVersion(v);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div>
      {name && <p style={{ color: palette.textMuted }}>{name}</p>}
      {version && <p style={{ color: palette.textMuted }}>Version {version}</p>}
      {error && <p style={{ color: palette.status.error }}>Couldn't read app info: {error}</p>}
    </div>
  );
}
