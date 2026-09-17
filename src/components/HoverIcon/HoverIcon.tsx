import { useState, type CSSProperties } from "react";

/** Renders a static PNG that swaps to a GIF while hovered (if provided),
 * reverting to the PNG on mouse-out. No PNG -> renders nothing.
 *
 * Rendered as a CSS mask (not <img>) so the icon is tinted with `color`
 * (default: currentColor, i.e. whatever palette color the surrounding text
 * already uses) instead of the source file's own baked-in colors - the icon
 * recolors live with the theme. Trade-off: a mask flattens the source art to
 * one solid color, so a multi-color source PNG/GIF loses its other colors.
 * The mask only respects transparency the source file actually encodes -
 * a GIF frame with an opaque background baked in will render as a solid
 * tinted square, not a cutout, no matter what color is passed here. */
export function HoverIcon({
  png,
  gif,
  alt,
  size = 16,
  color = "currentColor",
}: {
  png?: string;
  gif?: string;
  alt: string;
  size?: number;
  color?: string;
}) {
  const [hovered, setHovered] = useState(false);

  if (!png) return null;

  const src = hovered && gif ? gif : png;
  const maskStyle: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    flexShrink: 0,
    backgroundColor: color,
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };

  return (
    <span
      role="img"
      aria-label={alt}
      title={alt}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={maskStyle}
    />
  );
}
