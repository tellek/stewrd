import { invoke } from "@tauri-apps/api/core";

export interface StorageApi {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  getAll<T extends Record<string, unknown>>(): Promise<T>;
}

export function createStorageApi(pluginId: string): StorageApi {
  return {
    get: <T>(key: string) => invoke<T | undefined>("storage_get", { pluginId, key }),
    set: <T>(key: string, value: T) => invoke<void>("storage_set", { pluginId, key, value }),
    getAll: <T extends Record<string, unknown>>() => invoke<T>("storage_get_all", { pluginId }),
  };
}
