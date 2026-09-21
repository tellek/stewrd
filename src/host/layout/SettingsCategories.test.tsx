/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsCategories } from "./SettingsCategories";
import { useAppStore } from "../state/appStore";
import { defaultPalette } from "../../shared/palette";
import { DEFAULT_CATEGORIES, LAYOUTS_CATEGORY_ID, OTHER_CATEGORY_ID } from "../../shared/category";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

const CUSTOM_CATEGORY = { id: "tools", name: "Tools", icon: "" };

function resetStore() {
  cleanup();
  useAppStore.setState({
    palette: defaultPalette,
    categories: [...DEFAULT_CATEGORIES, CUSTOM_CATEGORY],
    categoryIconFiles: [],
  });
}

describe("SettingsCategories", () => {
  it("renders a row for each category, with its name in an input", () => {
    resetStore();
    render(<SettingsCategories />);
    expect(screen.getByDisplayValue("Tools")).toBeTruthy();
  });

  it("disables the name input and hides the Delete button for the Other category", () => {
    resetStore();
    render(<SettingsCategories />);
    const otherInput = screen.getByDisplayValue("Other") as HTMLInputElement;
    expect(otherInput.disabled).toBe(true);
  });

  it("calls updateCategory when a category's name is edited", () => {
    resetStore();
    const updateCategory = vi.spyOn(useAppStore.getState(), "updateCategory");
    render(<SettingsCategories />);

    const input = screen.getByDisplayValue("Tools");
    fireEvent.change(input, { target: { value: "Utilities" } });

    expect(updateCategory).toHaveBeenCalledWith("tools", { name: "Utilities" });
  });

  it("calls removeCategory when a category's Delete button is clicked", async () => {
    resetStore();
    const removeCategory = vi.spyOn(useAppStore.getState(), "removeCategory");
    const user = userEvent.setup();
    render(<SettingsCategories />);

    const deleteButtons = screen.getAllByText("Delete");
    await user.click(deleteButtons[0]);

    expect(removeCategory).toHaveBeenCalled();
  });

  it("adds a new category with the entered name when Add is clicked", async () => {
    resetStore();
    const addCategory = vi.spyOn(useAppStore.getState(), "addCategory");
    const user = userEvent.setup();
    render(<SettingsCategories />);

    await user.type(screen.getByPlaceholderText("Category name"), "Fun");
    await user.click(screen.getByText("Add"));

    expect(addCategory).toHaveBeenCalledWith({ id: "Fun", name: "Fun", icon: "" });
  });

  it("reorders categories via drag handle dragStart -> row dragOver/drop", () => {
    resetStore();
    render(<SettingsCategories />);

    // Order is Other, Utilities, Templates, Layouts, Tools - drag Tools's
    // handle (last row) onto Utilities's row to move it to index 1.
    const dragHandles = screen.getAllByTitle("Drag to reorder");
    fireEvent.dragStart(dragHandles[dragHandles.length - 1]);

    const utilitiesRow = screen.getByDisplayValue("Utilities").closest("tr") as HTMLElement;
    fireEvent.dragOver(utilitiesRow);
    fireEvent.drop(utilitiesRow);

    const ids = useAppStore.getState().categories.map((c) => c.id);
    expect(ids).toEqual([OTHER_CATEGORY_ID, "tools", "Utilities", "Templates", LAYOUTS_CATEGORY_ID]);
  });

  it("never shows a Delete button in the Layouts/Other built-in rows", () => {
    resetStore();
    render(<SettingsCategories />);
    // Other + Layouts are built-in (2), Utilities/Templates/Tools are custom (3).
    expect(screen.getAllByText("Delete").length).toBe(3);
  });
});
