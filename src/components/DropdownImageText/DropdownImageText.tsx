import type { DropdownImageTextProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { controlBase, disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.DropdownImageText. Item
 * images take a data URL - see plugins/_template/README.md's icon contract. */
export function DropdownImageText({ options, value, onChange, placeholder, disabled }: DropdownImageTextProps) {
  const palette = useAppStore((s) => s.palette);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const selected = options.find((o) => o.value === value);

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
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...(disabled ? disabledStyle() : {}),
        }}
      >
        {selected?.image && <img src={selected.image} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />}
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
                display: "flex",
                alignItems: "center",
                gap: 8,
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
              {opt.image && <img src={opt.image} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />}
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
