// Bundled category icons, looked up by category name. Drop a file named
// "<Category>.svg" or "<Category>.png" into src/assets/category-icons/ to
// give that category a real icon; categories with no matching file fall
// back to the disclosure glyph (see SidebarCategoryCollapsed).
const icons = import.meta.glob<string>("../../assets/category-icons/*.{svg,png}", {
  eager: true,
  query: "?url",
  import: "default",
});

const byCategory = new Map<string, string>();
for (const [path, url] of Object.entries(icons)) {
  const name = path.split("/").pop()!.replace(/\.(svg|png)$/, "");
  byCategory.set(name, url);
}

export function getCategoryIcon(category: string): string | undefined {
  return byCategory.get(category);
}
