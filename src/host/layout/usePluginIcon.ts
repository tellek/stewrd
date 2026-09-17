import { useEffect, useState } from "react";
import { getPluginIcon, type PluginIconUrls } from "../api/pluginIcons";

const cache = new Map<string, PluginIconUrls>();

/** Fetches a plugin's icon.png (if present) once per dir, cached for the
 * life of the app - plugin icons don't change without a reload. */
export function usePluginIcon(dir: string): PluginIconUrls {
  const [icons, setIcons] = useState<PluginIconUrls>(() => cache.get(dir) ?? {});

  useEffect(() => {
    const cached = cache.get(dir);
    if (cached) {
      setIcons(cached);
      return;
    }
    let cancelled = false;
    getPluginIcon(dir)
      .then((result) => {
        cache.set(dir, result);
        if (!cancelled) setIcons(result);
      })
      .catch(() => {
        // No icon files, or the command failed - render without one.
      });
    return () => {
      cancelled = true;
    };
  }, [dir]);

  return icons;
}
