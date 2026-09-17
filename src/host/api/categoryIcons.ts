import { invoke } from "@tauri-apps/api/core";

export interface CategoryIconFile {
  name: string;
  png?: string;
  gif?: string;
}

// Category icons live in <exe-dir>/assets/category-icons/ at runtime (copied
// there from src/assets/category-icons/ at build time - see build.rs for dev
// and tauri.conf.json's bundle.resources for the packaged app), not bundled
// via Vite - so a user can drop in more <name>.png/<name>.gif pairs after
// install without a rebuild.
export function listCategoryIcons(): Promise<CategoryIconFile[]> {
  return invoke<CategoryIconFile[]>("list_category_icons");
}
