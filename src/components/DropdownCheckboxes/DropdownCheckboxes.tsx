import type { DropdownCheckboxesProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { controlBase, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.DropdownCheckboxes. */
export function DropdownCheckboxes({ options, values, onChange, placeholder, disabled }: DropdownCheckboxesProps) {
  const palette = useAppStore((s) => s.palette);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  function toggle(value: string) {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  }

  const label = values.length > 0 ? options.filter((o) => values.includes(o.value)).map((o) => o.label).join(", ") : placeholder ?? "Select...";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", minWidth: 200 }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          ...controlBase(palette),
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...(disabled ? disabledStyle() : {}),
        }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 2,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            zIndex: 20,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                cursor: "pointer",
                color: palette.text,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = palette.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <input type="checkbox" checked={values.includes(opt.value)} onChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
