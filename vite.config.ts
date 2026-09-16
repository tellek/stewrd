import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import path from "node:path";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";
import { reactImportMapPlugin } from "./scripts/vite-plugin-react-importmap.ts";
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error import.meta.url typing depends on module target
const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), reactImportMapPlugin()],

  build: {
    rollupOptions: {
      // Each vendor-* entry emits a discoverable chunk that the
      // stewrd-react-importmap plugin resolves to a hashed URL for the
      // generated <script type="importmap">. Two separate things are needed to
      // keep those chunks usable as import-map targets:
      //
      // 1. `preserveEntrySignatures: "strict"` (here) - nothing inside the
      //    bundle consumes the facades' re-exports, so without it the minifier
      //    tree-shakes every export off the entry chunk.
      // 2. The facade sources are rewritten into explicit named re-exports by
      //    the stewrd-react-importmap plugin's `load` hook, because react is
      //    CommonJS and `export * from "react"` yields no statically-known
      //    names. See scripts/vite-plugin-react-importmap.ts.
      preserveEntrySignatures: "strict",
      input: {
        main: path.resolve(dirname, "index.html"),
        "vendor-react": path.resolve(dirname, "src/host/vendor-entries/react.ts"),
        "vendor-react-dom": path.resolve(dirname, "src/host/vendor-entries/react-dom.ts"),
        "vendor-react-dom-client": path.resolve(dirname, "src/host/vendor-entries/react-dom-client.ts"),
        "vendor-react-jsx-runtime": path.resolve(dirname, "src/host/vendor-entries/react-jsx-runtime.ts"),
        "vendor-tauri-core": path.resolve(dirname, "src/host/vendor-entries/tauri-core.ts"),
        "vendor-tauri-event": path.resolve(dirname, "src/host/vendor-entries/tauri-event.ts"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
