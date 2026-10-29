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
    title: "Creating And Publishing Tools",
    items: [
      "Settings > Plugins > Create New Plugin walks you through making your own tool: it creates a public GitHub repository named stewrd-<name>, clones it into the plugins folder, adds a working Hello World tool, and pushes it. It needs the GitHub CLI (gh) installed and signed in, and Git with your name and email set.",
      "Each step shows a check mark as it finishes. If one fails, fix the problem it names and click Retry; finished steps are skipped.",
      "When it's done, open the folder it shows with an AI coding assistant, or edit index.tsx by hand. See plugins/CLAUDE.md for the plugin API.",
      "Open Plugins Folder (next to Add Plugin) shows where your tools live on disk.",
      "Settings > Plugins > Add Plugin installs a tool from a .zip, .tar, .tar.gz, or .tgz file.",
      "For a tool that isn't in the Marketplace yet, the upload icon on its row (Publish To Marketplace) takes the place of Report an Issue and opens a pull request that adds the tool to the Marketplace. The tool must be a public GitHub repository with a release that has a .zip attached.",
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
