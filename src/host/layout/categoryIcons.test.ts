import { describe, expect, it } from "vitest";
import { getCategoryIcon, listCategoryIconNames } from "./categoryIcons";
import type { CategoryIconFile } from "../api/categoryIcons";

function file(name: string): CategoryIconFile {
  return { name, png: "" };
}

describe("getCategoryIcon", () => {
  it("returns undefined for an empty name", () => {
    expect(getCategoryIcon([file("a")], "")).toBeUndefined();
  });

  it("finds the file matching the given name", () => {
    const a = file("a");
    expect(getCategoryIcon([a, file("b")], "a")).toBe(a);
  });

  it("returns undefined when no file matches", () => {
    expect(getCategoryIcon([file("a")], "missing")).toBeUndefined();
  });
});

describe("listCategoryIconNames", () => {
  it("filters out fast-backward and fast-forward", () => {
    const names = listCategoryIconNames([file("fast-backward"), file("fast-forward"), file("gear")]);
    expect(names).toEqual(["gear"]);
  });

  it("returns all names when none are reserved", () => {
    expect(listCategoryIconNames([file("a"), file("b")])).toEqual(["a", "b"]);
  });
});
