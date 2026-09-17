export type StatusColor = "idle" | "in-progress" | "success" | "warning" | "error";

export interface Palette {
  background: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  status: Record<StatusColor, string>;
}

export const defaultPalette: Palette = {
  background: "#1e1e1e",
  surface: "#252526",
  surfaceHover: "#2a2d2e",
  text: "#e8e8e8",
  textMuted: "#9a9a9a",
  border: "#3c3c3c",
  accent: "#3b82f6",
  status: {
    idle: "#6b7280",
    "in-progress": "#3b82f6",
    success: "#22c55e",
    warning: "#eab308",
    error: "#ef4444",
  },
};

const lightPalette: Palette = {
  background: "#ffffff",
  surface: "#f3f3f3",
  surfaceHover: "#e8e8e8",
  text: "#1e1e1e",
  textMuted: "#6b6b6b",
  border: "#d4d4d4",
  accent: "#2563eb",
  status: {
    idle: "#6b7280",
    "in-progress": "#2563eb",
    success: "#16a34a",
    warning: "#ca8a04",
    error: "#dc2626",
  },
};

export interface NamedPalette {
  id: string;
  name: string;
  colors: Palette;
}

// Settings > Themes lets the user pick one of these or create/save their own
// (stored as NamedPalette entries in appStore's customPalettes).
export const premadePalettes: NamedPalette[] = [
  { id: "dark", name: "Dark", colors: defaultPalette },
  { id: "light", name: "Light", colors: lightPalette },
];
