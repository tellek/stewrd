// Bundled category icons, looked up by icon base name. Drop a file named
// "<name>.png" into src/assets/category-icons/ to make that name selectable
// as a category icon in Settings > Categories; drop a same-named "<name>.gif"
// alongside it to get a hover-swap animation (see HoverIcon) - no matching
// icon name just falls back to the disclosure glyph (see
// SidebarCategoryCollapsed).
const files = import.meta.glob<string>("../../assets/category-icons/*.{png,gif}", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface CategoryIconUrls {
  png?: string;
  gif?: string;
}

const byName = new Map<string, CategoryIconUrls>();
for (const [path, url] of Object.entries(files)) {
  const fileName = path.split("/").pop()!;
  const ext = fileName.endsWith(".gif") ? "gif" : "png";
  const name = fileName.replace(/\.(png|gif)$/, "");
  const entry = byName.get(name) ?? {};
  entry[ext] = url;
  byName.set(name, entry);
}

export function getCategoryIcon(name: string): CategoryIconUrls | undefined {
  return byName.get(name);
}

export function listCategoryIconNames(): string[] {
  return [...byName.keys()].sort();
}
