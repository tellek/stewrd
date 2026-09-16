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

// Single default palette for now - live theme switching (api.theme.subscribe)
// lands in Milestone 4.
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
