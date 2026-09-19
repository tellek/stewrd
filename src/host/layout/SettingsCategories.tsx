import { Fragment, useState } from "react";
import { useAppStore } from "../state/appStore";
import { OTHER_CATEGORY_ID } from "../../shared/category";
import { getCategoryIcon, listCategoryIconNames } from "./categoryIcons";
import { MaskIcon } from "../../components/MaskIcon/MaskIcon";
import { TextButton } from "../../components/TextButton/TextButton";
import { Dropdown } from "../../components/Dropdown/Dropdown";
import { Skeleton } from "../../components/Skeleton/Skeleton";

export function SettingsCategories() {
  const palette = useAppStore((s) => s.palette);
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const removeCategory = useAppStore((s) => s.removeCategory);
  const setCategories = useAppStore((s) => s.setCategories);
  const categoryIconFiles = useAppStore((s) => s.categoryIconFiles);
  const loadCategoryIcons = useAppStore((s) => s.loadCategoryIcons);
  const iconNames = listCategoryIconNames(categoryIconFiles);

  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function clearDrag() {
    setDraggedId(null);
    setDropTargetId(null);
  }

  function handleDrop(targetId: string) {
    return () => {
      if (draggedId && draggedId !== targetId) {
        const from = categories.findIndex((c) => c.id === draggedId);
        const to = categories.findIndex((c) => c.id === targetId);
        if (from >= 0 && to >= 0) {
          const next = [...categories];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          setCategories(next);
        }
      }
      clearDrag();
    };
  }

  const canAdd = newName.trim().length > 0 && !categories.some((c) => c.id === newName.trim());

  return (
    <div>
      <p style={{ color: palette.textMuted, fontSize: 13 }}>
        A plugin's <code>category</code> field must match a category name below or it lands in "Other". Icons
        come from <code>&lt;name&gt;.png</code> dropped into the <code>assets/category-icons</code> folder next
        to the running app, and are tinted to match the current theme.{" "}
        <TextButton label="Refresh Icon List" onClick={() => loadCategoryIcons()} />
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {categories.map((category) => {
            const icon = getCategoryIcon(categoryIconFiles, category.icon);
            const isOther = category.id === OTHER_CATEGORY_ID;
            const rowProps = {
              onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                if (draggedId && draggedId !== category.id) setDropTargetId(category.id);
              },
              onDrop: handleDrop(category.id),
            };
            return (
              <Fragment key={category.id}>
                {dropTargetId === category.id && draggedId !== category.id && (
                  <tr {...rowProps}>
                    <td colSpan={5} style={{ padding: "6px 8px" }}>
                      <Skeleton height={32} />
                    </td>
                  </tr>
                )}
                <tr
                  {...rowProps}
                  style={{ borderBottom: `1px solid ${palette.border}`, opacity: draggedId === category.id ? 0.5 : 1 }}
                >
                  <td
                    draggable
                    onDragStart={() => setDraggedId(category.id)}
                    onDragEnd={clearDrag}
                    title="Drag to reorder"
                    style={{ padding: "6px 4px", width: 16, color: palette.textMuted, cursor: "grab" }}
                  >
                    ⠿
                  </td>
                <td style={{ padding: "6px 8px", width: 40 }}>
                  {icon?.png && <MaskIcon png={icon.png} alt={category.name} size={24} color={palette.text} />}
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
                  <Dropdown
                    options={[{ label: "(none)", value: "" }, ...iconNames.map((n) => ({ label: n, value: n }))]}
                    value={category.icon}
                    disabled={isOther}
                    onChange={(icon) => updateCategory(category.id, { icon })}
                  />
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {!isOther && <TextButton label="Delete" onClick={() => removeCategory(category.id)} />}
                </td>
                </tr>
              </Fragment>
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
        <Dropdown
          options={[{ label: "(none)", value: "" }, ...iconNames.map((n) => ({ label: n, value: n }))]}
          value={newIcon}
          onChange={setNewIcon}
        />
        <TextButton
          label="Add"
          disabled={!canAdd}
          onClick={() => {
            addCategory({ id: newName.trim(), name: newName.trim(), icon: newIcon });
            setNewName("");
            setNewIcon("");
          }}
        />
      </div>

      <p style={{ color: palette.textMuted, fontSize: 11, marginTop: 20 }}>
        <a href="https://www.flaticon.com/free-animated-icons/technology" title="technology animated icons">
          Technology animated icons created by Magnific - Flaticon
        </a>
      </p>
    </div>
  );
}
