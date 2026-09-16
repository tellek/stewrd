import { useAppStore } from "../state/appStore";
import type { Palette } from "../../shared/palette";

export interface ThemeApi {
  readonly palette: Palette;
  subscribe(fn: (p: Palette) => void): () => void;
}

// Single default palette for now (no light/dark switching yet) - subscribe
// still wired properly so plugins written against it keep working once
// theme switching lands.
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
