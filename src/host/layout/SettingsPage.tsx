import { useEffect, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { defaultPalette } from "../../shared/palette";

export function SettingsPage() {
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
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      {name && <p style={{ color: defaultPalette.textMuted }}>{name}</p>}
      {version && <p style={{ color: defaultPalette.textMuted }}>Version {version}</p>}
      {error && (
        <p style={{ color: defaultPalette.status.error }}>Couldn't read app info: {error}</p>
      )}
    </div>
  );
}
