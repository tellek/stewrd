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
  {
    id: "aperture",
    name: "Aperture",
    colors: {
      background: "#16181c",
      surface: "#1f2226",
      surfaceHover: "#292d33",
      text: "#eef1f4",
      textMuted: "#8b95a1",
      border: "#2c3036",
      accent: "#ff9a00",
      status: { idle: "#6b7280", "in-progress": "#36c0f1", success: "#4caf6a", warning: "#f2c14e", error: "#e0533d" },
    },
  },
  {
    id: "katana",
    name: "Katana",
    colors: {
      background: "#121212",
      surface: "#1a1a1a",
      surfaceHover: "#242424",
      text: "#f2f2f2",
      textMuted: "#9a9a9a",
      border: "#2e2e2e",
      accent: "#ff2222",
      status: { idle: "#8a8a8a", "in-progress": "#ff4d4d", success: "#4caf6e", warning: "#ffab30", error: "#ff3b30" },
    },
  },
  {
    id: "phantom",
    name: "Phantom",
    colors: {
      background: "#0d0d0d",
      surface: "#1a1a1a",
      surfaceHover: "#262626",
      text: "#f5f2ed",
      textMuted: "#a89b96",
      border: "#3a2828",
      accent: "#d92323",
      status: { idle: "#8a8380", "in-progress": "#e6483f", success: "#4caf6e", warning: "#e0a83d", error: "#ff3b3b" },
    },
  },
  {
    id: "pipboy",
    name: "Pip-Boy",
    colors: {
      background: "#0b0f0a",
      surface: "#141c13",
      surfaceHover: "#1e2a1c",
      text: "#d4f5c5",
      textMuted: "#8fa888",
      border: "#2c3b29",
      accent: "#3dff3d",
      status: { idle: "#8a9188", "in-progress": "#5fe85f", success: "#4ade80", warning: "#e8a33d", error: "#e5484d" },
    },
  },
  {
    id: "icarus",
    name: "Icarus",
    colors: {
      background: "#0d0b08",
      surface: "#171310",
      surfaceHover: "#221c15",
      text: "#f0e6d2",
      textMuted: "#9c8f78",
      border: "#3a2f1f",
      accent: "#d4a017",
      status: { idle: "#8a8378", "in-progress": "#e0b23c", success: "#7a9450", warning: "#c9862f", error: "#a63d2f" },
    },
  },
  {
    id: "nightcity",
    name: "Night City",
    colors: {
      background: "#0d0d10",
      surface: "#17171b",
      surfaceHover: "#212126",
      text: "#f4f4f2",
      textMuted: "#8f8f96",
      border: "#2a2a30",
      accent: "#fcee0a",
      status: { idle: "#6e6e76", "in-progress": "#00e5ff", success: "#2ed573", warning: "#ff9f1c", error: "#ff3860" },
    },
  },
  {
    id: "hyrule",
    name: "Hyrule",
    colors: {
      background: "#12140f",
      surface: "#1c2018",
      surfaceHover: "#262b1f",
      text: "#e8e4d8",
      textMuted: "#9a9a86",
      border: "#33392a",
      accent: "#5ee6a8",
      status: { idle: "#8a8a7a", "in-progress": "#4fb8e0", success: "#5ee6a8", warning: "#e0a83f", error: "#d4574a" },
    },
  },
  {
    id: "talon",
    name: "Talon",
    colors: {
      background: "#1a1d21",
      surface: "#24282d",
      surfaceHover: "#2e333a",
      text: "#f5f5f0",
      textMuted: "#9aa0a6",
      border: "#34383e",
      accent: "#f99e1a",
      status: { idle: "#6b7078", "in-progress": "#3d8bc9", success: "#4caf6e", warning: "#f9a825", error: "#e05252" },
    },
  },
  {
    id: "bridges",
    name: "Bridges",
    colors: {
      background: "#14161a",
      surface: "#1e2126",
      surfaceHover: "#282c33",
      text: "#e8e3da",
      textMuted: "#9c8c7c",
      border: "#34343c",
      accent: "#dc8d18",
      status: { idle: "#6f6a63", "in-progress": "#dc8d18", success: "#7a9b76", warning: "#f4d136", error: "#b5453a" },
    },
  },
  {
    id: "silhouette",
    name: "Silhouette",
    colors: {
      background: "#0a0a0c",
      surface: "#131316",
      surfaceHover: "#1c1c20",
      text: "#e8e8ea",
      textMuted: "#8a8a90",
      border: "#232326",
      accent: "#b8c4cc",
      status: { idle: "#6e6e74", "in-progress": "#9db0bc", success: "#7a9a7e", warning: "#c9a35c", error: "#b05f56" },
    },
  },
  {
    id: "redstone",
    name: "Redstone",
    colors: {
      background: "#0e1611",
      surface: "#16201a",
      surfaceHover: "#1e2c23",
      text: "#e8ece5",
      textMuted: "#8fa08e",
      border: "#2a3a2e",
      accent: "#4caf50",
      status: { idle: "#7a8577", "in-progress": "#5cb85c", success: "#43a047", warning: "#d4a017", error: "#c0392b" },
    },
  },
  {
    id: "inkwell",
    name: "Inkwell",
    colors: {
      background: "#1a120b",
      surface: "#241a10",
      surfaceHover: "#2e2216",
      text: "#f2e8d5",
      textMuted: "#a89a82",
      border: "#3a2c1c",
      accent: "#e0330e",
      status: { idle: "#8a8073", "in-progress": "#3a6ea5", success: "#7a9a4a", warning: "#e0a83e", error: "#c0392b" },
    },
  },
  {
    id: "yharnam",
    name: "Yharnam",
    colors: {
      background: "#0e0b0a",
      surface: "#1a1412",
      surfaceHover: "#241c19",
      text: "#e8ddd5",
      textMuted: "#9a877f",
      border: "#332621",
      accent: "#9a1818",
      status: { idle: "#8a8078", "in-progress": "#5f7d8a", success: "#7a9b5c", warning: "#d1943f", error: "#c0392b" },
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    colors: {
      background: "#0a1620",
      surface: "#0f2333",
      surfaceHover: "#16324a",
      text: "#e6f6fa",
      textMuted: "#8fb3c2",
      border: "#1d3f57",
      accent: "#2ee6d6",
      status: { idle: "#7c93a0", "in-progress": "#3fb8e0", success: "#3ddc84", warning: "#ff9d3d", error: "#ff5c5c" },
    },
  },
];
