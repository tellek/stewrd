// Inline SVG icons for the Settings > Plugins row buttons. IconButton renders
// them through MaskIcon, which only uses the shape's alpha and tints it with
// a palette color, so the fill here is irrelevant to the final look.
function svg(path: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black">${path}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

export const configureIcon = svg(
  '<path d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>',
);

export const activateIcon = svg('<path d="M8 5v14l11-7z"/>');

export const deactivateIcon = svg('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>');

export const removeIcon = svg(
  '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/>',
);

export const publishIcon = svg('<path d="M5 20h14v-2H5v2ZM12 2 6 8h4v6h4V8h4l-6-6Z"/>');

export const reportIssueIcon = svg(
  '<path d="M20 8h-2.8a6 6 0 0 0-1.6-1.8L17 4.8 15.6 3.4l-2 2a6 6 0 0 0-3.2 0l-2-2L7 4.8l1.4 1.4A6 6 0 0 0 6.8 8H4v2h2.1c-.1.3-.1.7-.1 1v1H4v2h2v1c0 .3 0 .7.1 1H4v2h2.8a6 6 0 0 0 10.4 0H20v-2h-2.1c.1-.3.1-.7.1-1v-1h2v-2h-2v-1c0-.3 0-.7-.1-1H20V8Zm-6 8h-4v-2h4v2Zm0-4h-4v-2h4v2Z"/>',
);
