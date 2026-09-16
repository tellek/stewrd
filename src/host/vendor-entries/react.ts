// Production-build-only facade: gives the react-importmap Vite plugin a stable
// entry point to find in the build's output bundle (see vite.config.ts), so the
// generated <script type="importmap"> can point plugins at the host's exact
// React instance - never a second React.
//
// This file intentionally has an empty body. react is CommonJS, and a star
// re-export of a CJS module compiles to zero named exports (and `export * from
// "react"` does not even type-check, since @types/react uses `export =`). The
// stewrd-react-importmap plugin's `load` hook replaces this file's contents at
// build time with an explicit named re-export list read from the installed
// package. See scripts/vite-plugin-react-importmap.ts.
export {};
