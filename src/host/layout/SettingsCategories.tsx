import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { OTHER_CATEGORY_ID } from "../../shared/category";
import { getCategoryIcon, listCategoryIconNames } from "./categoryIcons";
import { HoverIcon } from "../../components/HoverIcon/HoverIcon";

export function SettingsCategories() {
  const palette = useAppStore((s) => s.palette);
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const removeCategory = useAppStore((s) => s.removeCategory);
  const iconNames = listCategoryIconNames();

  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");

  const canAdd = newName.trim().length > 0 && !categories.some((c) => c.id === newName.trim());

  return (
    <div>
      <p style={{ color: palette.textMuted, fontSize: 13 }}>
        A plugin's <code>category</code> field must match a category name below or it lands in "Other". Icons
        come from files dropped into <code>src/assets/category-icons/</code>.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {categories.map((category) => {
            const icon = getCategoryIcon(category.icon);
            const isOther = category.id === OTHER_CATEGORY_ID;
            return (
              <tr key={category.id} style={{ borderBottom: `1px solid ${palette.border}` }}>
                <td style={{ padding: "6px 8px", width: 24 }}>
                  {icon?.png && <HoverIcon png={icon.png} gif={icon.gif} alt={category.name} />}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  <input
                    value={category.name}
                    disabled={isOther}
                    onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                    style={{
                      background: palette.surface,
                      color: palette.text,
                      border: `1px solid ${palette.border}`,
                      borderRadius: 4,
                      padding: "4px 6px",
                    }}
                  />
                </td>
                <td style={{ padding: "6px 8px" }}>
                  <select
                    value={category.icon}
                    disabled={isOther}
                    onChange={(e) => updateCategory(category.id, { icon: e.target.value })}
                    style={{
                      background: palette.surface,
                      color: palette.text,
                      border: `1px solid ${palette.border}`,
                      borderRadius: 4,
                      padding: "4px 6px",
                    }}
                  >
                    <option value="">(none)</option>
                    {iconNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {!isOther && (
                    <button onClick={() => removeCategory(category.id)} style={{ cursor: "pointer" }}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ fontSize: 13, marginTop: 20 }}>Add category</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Category name"
          style={{
            background: palette.surface,
            color: palette.text,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            padding: "4px 6px",
          }}
        />
        <select
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
          style={{
            background: palette.surface,
            color: palette.text,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            padding: "4px 6px",
          }}
        >
          <option value="">(none)</option>
          {iconNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          disabled={!canAdd}
          onClick={() => {
            addCategory({ id: newName.trim(), name: newName.trim(), icon: newIcon });
            setNewName("");
            setNewIcon("");
          }}
          style={{ cursor: canAdd ? "pointer" : "default" }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
