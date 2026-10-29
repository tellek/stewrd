// Plugins are imported from Blob URLs (see pluginLoader.ts), so a stack frame
// from plugin code names `blob:...` rather than a file. This remembers which
// plugin each live blob URL belongs to, so an uncaught error can be
// attributed to the plugin that threw it.
const owners = new Map<string, string>();

export function registerBlobOwner(blobUrl: string, pluginId: string): void {
  owners.set(blobUrl, pluginId);
}

export function unregisterBlobOwner(blobUrl: string): void {
  owners.delete(blobUrl);
}

/** The plugin id whose blob URL appears in `stack`, if any. */
export function pluginIdFromStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const [url, id] of owners) {
    if (stack.includes(url)) return id;
  }
  return undefined;
}
