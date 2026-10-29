// templates/hello/index.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var NAME = "__PLUGIN_NAME__";
function activate(ctx) {
  ctx.api.statusIcon.set("idle");
  ctx.api.log.info(`${NAME} activated`);
}
function Component({ api }) {
  const { TextButton } = api.ui;
  const [clicks, setClicks] = useState(0);
  const palette = api.theme.palette;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, color: palette.text }, children: [
    /* @__PURE__ */ jsxs("h2", { style: { margin: 0 }, children: [
      "Hello From ",
      NAME
    ] }),
    /* @__PURE__ */ jsxs("p", { style: { margin: 0, color: palette.textMuted }, children: [
      "Edit index.tsx, then run the build to see your changes. Clicked ",
      clicks,
      " times."
    ] }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextButton, { label: "Say Hello", variant: "primary", onClick: () => setClicks((c) => c + 1) }) })
  ] });
}
export {
  Component,
  activate
};
