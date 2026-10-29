import { useAppStore } from "../state/appStore";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Opening Tools",
    items: [
      "Click a tool in the sidebar to open it in the active pane (the one with the accent outline). Click any pane to make it active.",
      "Click the collapse button at the bottom of the sidebar to shrink it to an icon rail; click it again to expand.",
    ],
  },
  {
    title: "Split Panes",
    items: [
      "Drag a tool from the sidebar onto a pane. The highlighted zone shows what will happen on drop.",
      "Drop on the left, right, top, or bottom edge of a pane to split it and open the tool in the new half.",
      "Drop in the middle of a pane to replace the tool it currently shows.",
      "Click the ✕ in a pane's top-right corner to close it (shown when more than one pane is open).",
    ],
  },
  {
    title: "Resizing Panes",
    items: [
      "Drag the divider between two panes to resize them. Neither side can shrink below 15%.",
    ],
  },
  {
    title: "Zooming Tools",
    items: [
      "Hold Ctrl and scroll the mouse wheel over a pane to zoom that tool in or out.",
      "Ctrl and + zooms in, Ctrl and - zooms out, Ctrl and 0 resets to 100%. These apply to the active pane.",
      "A percentage and Reset button appear in the pane's top-right corner while you zoom.",
      "Zoom is remembered per pane, and a tool opened in a new pane starts at the zoom you last used for it.",
    ],
  },
  {
    title: "Organizing The Sidebar",
    items: [
      "Drag tools to reorder them within a category, or into another category to move them there. The move is saved to the tool's settings.json.",
      "Settings > Categories lets you add, rename, re-icon, delete, and drag to reorder categories.",
      "Use the + in the Layouts section to save the current pane arrangement, and click a saved layout to restore it.",
    ],
  },
  {
    title: "Plugins And Updates",
    items: [
      "Settings > Plugins lets you create, publish, update, and remove tools, and report issues. The Marketplace tool browses and installs community tools.",
      "Settings > Themes switches the color theme for the whole app.",
      "Settings > Version shows the installed version and release notes.",
    ],
  },
];

export function SettingsHelp() {
  const palette = useAppStore((s) => s.palette);
  return (
    <div style={{ fontSize: 13, color: palette.text }}>
      {SECTIONS.map((s) => (
        <section key={s.title} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>{s.title}</h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: palette.textMuted, lineHeight: 1.6 }}>
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
