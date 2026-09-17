import { useAppStore } from "../state/appStore";
import type { Palette } from "../../shared/palette";

export interface ThemeApi {
  readonly palette: Palette;
  subscribe(fn: (p: Palette) => void): () => void;
}

// Palette is switchable via Settings > Themes (appStore.paletteId /
// customPalettes) - reads/subscribes the store's derived `palette` field so
// plugins see live theme changes without any extra wiring.
export function createThemeApi(): ThemeApi {
  return {
    get palette() {
      return useAppStore.getState().palette;
    },
    subscribe(fn) {
      let prev = useAppStore.getState().palette;
      return useAppStore.subscribe((state) => {
        if (state.palette !== prev) {
          prev = state.palette;
          fn(state.palette);
        }
      });
    },
  };
}
