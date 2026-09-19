import type { PaginationProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Pagination. */
export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  const palette = useAppStore((s) => s.palette);

  function pageButton(label: string, target: number, disabled: boolean, key: string) {
    return (
      <button
        key={key}
        onClick={() => !disabled && onChange(target)}
        disabled={disabled}
        style={{
          background: palette.surface,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          borderRadius: 4,
          padding: "4px 10px",
          fontFamily: "inherit",
          fontSize: "inherit",
          cursor: "pointer",
          ...(disabled ? disabledStyle() : {}),
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {pageButton("Prev", page - 1, page <= 1, "prev")}
      <span style={{ color: palette.text, padding: "0 8px" }}>
        Page {page} of {pageCount}
      </span>
      {pageButton("Next", page + 1, page >= pageCount, "next")}
    </div>
  );
}
