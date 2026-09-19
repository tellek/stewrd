import type { DropdownProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { controlBase, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Dropdown. */
export function Dropdown({ options, value, onChange, placeholder, disabled }: DropdownProps) {
  const palette = useAppStore((s) => s.palette);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", minWidth: 160 }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          ...controlBase(palette),
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          cursor: "pointer",
          ...(disabled ? disabledStyle() : {}),
        }}
      >
        {selected?.label ?? placeholder ?? "Select..."}
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
            <div
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                color: palette.text,
                background: opt.value === value ? palette.surfaceHover : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = palette.surfaceHover)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = opt.value === value ? palette.surfaceHover : "transparent")
              }
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
