// Lets plugin code `import icon from "./assets/foo.png"` for editor
// type-checking - esbuild's dataurl loader (see stewrd-plugin-build.mjs)
// inlines these as base64 data URL strings at build time.
declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}
declare module "*.svg" {
  const dataUrl: string;
  export default dataUrl;
}
declare module "*.jpg" {
  const dataUrl: string;
  export default dataUrl;
}
declare module "*.jpeg" {
  const dataUrl: string;
  export default dataUrl;
}
declare module "*.gif" {
  const dataUrl: string;
  export default dataUrl;
}
