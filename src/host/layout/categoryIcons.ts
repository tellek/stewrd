import type { CategoryIconFile } from "../api/categoryIcons";

export function getCategoryIcon(files: CategoryIconFile[], name: string): CategoryIconFile | undefined {
  if (!name) return undefined;
  return files.find((f) => f.name === name);
}

export function listCategoryIconNames(files: CategoryIconFile[]): string[] {
  return files.map((f) => f.name);
}
