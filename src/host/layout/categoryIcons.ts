import type { CategoryIconFile } from "../api/categoryIcons";

// Reserved for chrome (e.g. the sidebar collapse toggle), not offered as
// selectable category icons in Settings.
const RESERVED_ICON_NAMES = new Set(["fast-backward", "fast-forward"]);

export function getCategoryIcon(files: CategoryIconFile[], name: string): CategoryIconFile | undefined {
  if (!name) return undefined;
  return files.find((f) => f.name === name);
}

export function listCategoryIconNames(files: CategoryIconFile[]): string[] {
  return files.filter((f) => !RESERVED_ICON_NAMES.has(f.name)).map((f) => f.name);
}
