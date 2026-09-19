import { invoke } from "@tauri-apps/api/core";

export interface FsApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  /** Reads a binary file from this plugin's namespaced folder and returns it
   * as a `data:` URL, for use with icon-bearing components (IconButton,
   * IconTextButton, Banner, DropdownImageText, DropdownImageGrid). */
  readDataUrl(path: string): Promise<string>;
  watchFile(path: string, onChange: () => void): () => void;
}

export function createFsApi(pluginId: string): FsApi {
  return {
    readTextFile: (path) => invoke<string>("fs_read_text_file", { pluginId, path }),
    writeTextFile: (path, contents) => invoke<void>("fs_write_text_file", { pluginId, path, contents }),
    readDataUrl: (path) => invoke<string>("fs_read_data_url", { pluginId, path }),
    watchFile(_path, _onChange) {
      // Deferred: no plugin needs this yet (Milestone 4's build order omits
      // fs entirely). Fails loudly rather than silently no-op-ing so a future
      // caller notices immediately instead of debugging a mysteriously inert
      // watch.
      console.warn(`[plugin:${pluginId}] api.fs.watchFile is not implemented yet`);
      return () => {};
    },
  };
}
