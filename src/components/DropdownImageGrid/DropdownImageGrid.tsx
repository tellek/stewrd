import type { DropdownImageGridProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { controlBase, disabledStyle } from "../shared/styles";
import { MaskIcon } from "../MaskIcon/MaskIcon";

/** Plugin-facing primitive, exposed via api.ui.DropdownImageGrid. Item
 * images take a data URL - see plugins/_template/README.md's icon contract.
 * Pass `tint` for single-color glyph sets so they recolor with the palette
 * instead of rendering with their own baked-in colors (see MaskIcon). */
export function DropdownImageGrid({ options, value, onChange, placeholder, disabled, tint }: DropdownImageGridProps) {
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
        {selected?.image &&
          (tint ? (
            <MaskIcon png={selected.image} alt="" size={18} color={tint} />
          ) : (
            <img src={selected.image} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
          ))}
        {selected?.label ?? placeholder ?? "Select..."}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            zIndex: 20,
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            maxHeight: 240,
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: `${palette.border} ${palette.surface}`,
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              title={opt.label}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 6,
                borderRadius: 4,
                cursor: "pointer",
                border: `1px solid ${opt.value === value ? palette.accent : "transparent"}`,
                background: opt.value === value ? palette.surfaceHover : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = palette.surfaceHover)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = opt.value === value ? palette.surfaceHover : "transparent")
              }
            >
              {opt.image &&
                (tint ? (
                  <MaskIcon png={opt.image} alt="" size={32} color={tint} />
                ) : (
                  <img src={opt.image} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
                ))}
              <span style={{ fontSize: 11, color: palette.text, whiteSpace: "nowrap" }}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
