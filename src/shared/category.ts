export interface CategoryDef {
  id: string;
  name: string;
  /** Base name of a file in src/assets/category-icons/ (no extension), or "" for none. */
  icon: string;
}

// `id` is the stable key plugins match against (manifest.category === id).
// `name` is the display label and can be renamed without breaking plugin
// matching. Other is built-in, undeletable, and unrenameable - it's the
// catch-all for any manifest.category that doesn't match a known id.
export const OTHER_CATEGORY_ID = "Other";

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: OTHER_CATEGORY_ID, name: "Other", icon: "" },
  { id: "Utilities", name: "Utilities", icon: "" },
  { id: "Templates", name: "Templates", icon: "" },
];

export function resolveCategory(categories: CategoryDef[], rawCategory: string): CategoryDef {
  return (
    categories.find((c) => c.id === rawCategory) ?? categories.find((c) => c.id === OTHER_CATEGORY_ID) ?? DEFAULT_CATEGORIES[0]
  );
}
