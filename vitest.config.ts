import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts (which has Tauri/build-specific
// config - multi-entry rollupOptions, the react-importmap plugin - that's
// irrelevant noise for unit tests and would slow down test collection).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "plugins/**/*.test.{ts,tsx}"],
  },
});
