import type { CSSProperties } from "react";

/** Renders a PNG as a CSS mask so it's tinted with `color` (default:
 * currentColor, i.e. whatever palette color the surrounding text already
 * uses) instead of the source file's own baked-in colors - the icon
 * recolors live with the theme. Trade-off: masking flattens multi-color
 * source art to one solid color, and only respects transparency the source
 * PNG actually encodes. No PNG -> renders nothing. */
export function MaskIcon({
  png,
  alt,
  size = 24,
  color = "currentColor",
}: {
  png?: string;
  alt: string;
  size?: number;
  color?: string;
}) {
  if (!png) return null;

  const maskStyle: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    flexShrink: 0,
    backgroundColor: color,
    WebkitMaskImage: `url(${png})`,
    maskImage: `url(${png})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };

  return <span role="img" aria-label={alt} title={alt} style={maskStyle} />;
}
