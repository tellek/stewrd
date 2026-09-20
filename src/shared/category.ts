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

// Also built-in, undeletable, and unrenameable, like Other - but it isn't a
// plugin bucket at all. Sidebar.tsx special-cases this id to render the
// Layouts section (saved pane layouts + "Save") instead of a plugin list, so
// it can still be dragged to any position in Settings > Categories like a
// normal category. See host/state/appStore.ts's `layouts`.
export const LAYOUTS_CATEGORY_ID = "Layouts";

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: OTHER_CATEGORY_ID, name: "Other", icon: "menu" },
  { id: "Utilities", name: "Utilities", icon: "" },
  { id: "Templates", name: "Templates", icon: "" },
  { id: LAYOUTS_CATEGORY_ID, name: "Layouts", icon: "diagram" },
];

export function resolveCategory(categories: CategoryDef[], rawCategory: string): CategoryDef {
  return (
    categories.find((c) => c.id === rawCategory) ?? categories.find((c) => c.id === OTHER_CATEGORY_ID) ?? DEFAULT_CATEGORIES[0]
  );
}
