import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_ID, resolveCategory } from "./category";

describe("resolveCategory", () => {
  it("matches a category by id", () => {
    expect(resolveCategory(DEFAULT_CATEGORIES, "Utilities").id).toBe("Utilities");
  });

  it("falls back to Other for an unrecognized category", () => {
    expect(resolveCategory(DEFAULT_CATEGORIES, "SomethingNew").id).toBe(OTHER_CATEGORY_ID);
  });

  it("still returns a valid Other-id category if the passed-in list lacks one", () => {
    const withoutOther = DEFAULT_CATEGORIES.filter((c) => c.id !== OTHER_CATEGORY_ID);
    expect(resolveCategory(withoutOther, "SomethingNew").id).toBe(OTHER_CATEGORY_ID);
  });
});
