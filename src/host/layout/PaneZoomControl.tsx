import { useEffect, useRef, useState, type RefObject } from "react";
import { useAppStore, ZOOM_STEP } from "../state/appStore";
import type { Palette } from "../../shared/palette";

// Accumulated wheel delta that counts as one zoom step. A mouse wheel notch
// is ~100; touchpad pinch fires many tiny deltas that must add up first.
const WHEEL_STEP_DELTA = 100;
const HIDE_AFTER_MS = 2000;

/** Effective zoom of a pane: its own, else its plugin's last-used, else 100%. */
export function useEffectiveZoom(zoom: number | undefined, pluginId: string | null): number {
  const pluginZoom = useAppStore((s) => (pluginId ? s.pluginZoom[pluginId] : undefined));
  return zoom ?? pluginZoom ?? 1;
}

/** Ctrl+wheel and Ctrl +/-/0 zoom for a pane. Both listeners run in the
 * capture phase and swallow the event, so plugins (xterm etc.) never see it.
 * `onChange` fires after every zoom change so the overlay can show itself. */
export function usePaneZoomInput(
  containerRef: RefObject<HTMLElement | null>,
  paneId: string,
  pluginId: string | null,
  zoom: number,
  onChange: () => void,
): void {
  // Latest values for the long-lived listeners.
  const latest = useRef({ zoom, pluginId, onChange });
  latest.current = { zoom, pluginId, onChange };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let acc = 0;
    const apply = (next: number) => {
      useAppStore.getState().setPaneZoom(paneId, next);
      latest.current.onChange();
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !latest.current.pluginId) return;
      e.preventDefault();
      e.stopPropagation();
      acc += e.deltaY;
      const steps = Math.trunc(acc / WHEEL_STEP_DELTA);
      if (steps === 0) return;
      acc -= steps * WHEEL_STEP_DELTA;
      apply(latest.current.zoom - steps * ZOOM_STEP);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || !latest.current.pluginId) return;
      const { activePaneId, view } = useAppStore.getState();
      if (activePaneId !== paneId || view !== "plugin") return;
      let next: number | null = null;
      if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd") next = latest.current.zoom + ZOOM_STEP;
      else if (e.key === "-" || e.code === "NumpadSubtract") next = latest.current.zoom - ZOOM_STEP;
      else if (e.key === "0" || e.code === "Numpad0") next = 1;
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      apply(next);
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKey, true);
    };
  }, [containerRef, paneId]);
}

/** Top-right percentage readout with a Reset button. Appears on zoom change,
 * hides after 2s unless hovered. */
export function PaneZoomControl({
  paneId,
  zoom,
  visible,
  palette,
  onHold,
  onRelease,
}: {
  paneId: string;
  zoom: number;
  visible: boolean;
  palette: Palette;
  onHold: () => void;
  onRelease: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      onMouseEnter={onHold}
      onMouseLeave={onRelease}
      style={{
        position: "absolute",
        top: 4,
        right: 28,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        fontSize: 12,
        color: palette.text,
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 4,
      }}
    >
      <span>{Math.round(zoom * 100)}%</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          useAppStore.getState().setPaneZoom(paneId, 1);
        }}
        style={{
          border: "none",
          background: "transparent",
          color: palette.accent,
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
        }}
      >
        Reset
      </button>
    </div>
  );
}

/** Visibility state for the overlay: `show()` on zoom change starts the 2s
 * hide timer, `hold()`/`release()` pin it open while hovered. */
export function useOverlayVisibility() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  const arm = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!hovered.current) setVisible(false);
    }, HIDE_AFTER_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    visible,
    show: () => {
      setVisible(true);
      arm();
    },
    hold: () => {
      hovered.current = true;
      clearTimeout(timer.current);
    },
    release: () => {
      hovered.current = false;
      arm();
    },
  };
}
