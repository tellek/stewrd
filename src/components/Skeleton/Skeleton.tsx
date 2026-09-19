import type { SkeletonProps } from "../../shared/plugin-api.d.ts";
import { useAppStore } from "../../host/state/appStore";

/** Plugin-facing primitive, exposed via api.ui.Skeleton. */
export function Skeleton({ width = "100%", height = 16 }: SkeletonProps) {
  const palette = useAppStore((s) => s.palette);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${palette.surface} 25%, ${palette.surfaceHover} 50%, ${palette.surface} 75%)`,
        backgroundSize: "200% 100%",
        animation: "stewrd-skeleton 1.4s ease infinite",
      }}
    >
      <style>{"@keyframes stewrd-skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }"}</style>
    </div>
  );
}
