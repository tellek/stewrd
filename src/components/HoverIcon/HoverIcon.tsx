import { useState } from "react";

/** Renders a static PNG that swaps to a GIF while hovered (if provided),
 * reverting to the PNG on mouse-out. No PNG -> renders nothing. */
export function HoverIcon({
  png,
  gif,
  alt,
  size = 16,
}: {
  png?: string;
  gif?: string;
  alt: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState(false);

  if (!png) return null;

  return (
    <img
      src={hovered && gif ? gif : png}
      alt={alt}
      width={size}
      height={size}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
}
