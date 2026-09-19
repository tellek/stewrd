import type { MenuProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";
import { usePopover } from "../shared/usePopover";
import { disabledStyle } from "../shared/styles";

/** Plugin-facing primitive, exposed via api.ui.Menu. Renders `trigger` as the
 * click target and pops the item list below it. */
export function Menu({ items, trigger }: MenuProps) {
  const palette = useAppStore((s) => s.palette);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        {trigger}
      </div>
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
            minWidth: 160,
          }}
        >
          {items.map((item) => (
            <div
              key={item.label}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                setOpen(false);
              }}
              style={{
                padding: "6px 12px",
                cursor: item.disabled ? "not-allowed" : "pointer",
                color: palette.text,
                ...(item.disabled ? disabledStyle() : {}),
              }}
              onMouseEnter={(e) => !item.disabled && (e.currentTarget.style.background = palette.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
