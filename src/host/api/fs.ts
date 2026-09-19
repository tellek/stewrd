import { invoke } from "@tauri-apps/api/core";

export interface FsDirEntry {
  name: string;
  isDir: boolean;
}

export interface FsApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  /** Reads a binary file from this plugin's namespaced folder and returns it
   * as a `data:` URL, for use with icon-bearing components (IconButton,
   * IconTextButton, Banner, DropdownImageText, DropdownImageGrid). */
  readDataUrl(path: string): Promise<string>;
  /** Lists entries in a directory within this plugin's namespaced folder.
   * Returns an empty list if the directory doesn't exist yet. */
  listDir(path?: string): Promise<FsDirEntry[]>;
  /** Absolute path of this plugin's sandboxed storage folder on disk, e.g.
   * for use as `cwd` when spawning an external process via api.shell. */
  getRootPath(): Promise<string>;
  deleteFile(path: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  watchFile(path: string, onChange: () => void): () => void;
}

export function createFsApi(pluginId: string): FsApi {
  return {
    readTextFile: (path) => invoke<string>("fs_read_text_file", { pluginId, path }),
    writeTextFile: (path, contents) => invoke<void>("fs_write_text_file", { pluginId, path, contents }),
    readDataUrl: (path) => invoke<string>("fs_read_data_url", { pluginId, path }),
    listDir: (path) => invoke<FsDirEntry[]>("fs_list_dir", { pluginId, path }),
    getRootPath: () => invoke<string>("fs_get_root_path", { pluginId }),
    deleteFile: (path) => invoke<void>("fs_delete_file", { pluginId, path }),
    renameFile: (from, to) => invoke<void>("fs_rename_file", { pluginId, from, to }),
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
