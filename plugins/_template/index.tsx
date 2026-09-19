/// <reference path="../.stewrd/plugin-api.d.ts" />
// Copy this whole folder to start a new plugin. Rename the directory, update
// plugin.json's id/name/category, then build it into working functionality
// starting from the minimal activate()/Component below. Every commented-out
// block demonstrates one host API surface - uncomment what you need, delete
// the rest. See README.md for manifest fields + lifecycle order.
import { useEffect, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
import { ButtonsDemo } from "./demos/ButtonsDemo";
import { FormControlsDemo } from "./demos/FormControlsDemo";
import { LoadingDemo } from "./demos/LoadingDemo";
import { DropdownsDemo } from "./demos/DropdownsDemo";
import { NavigationDemo } from "./demos/NavigationDemo";
import { OverlaysDemo } from "./demos/OverlaysDemo";
import { MessagingDemo } from "./demos/MessagingDemo";
import { CalendarDemo } from "./demos/CalendarDemo";
import { TextAreaDemo } from "./demos/TextAreaDemo";

export function activate(ctx: PluginContext) {
  ctx.api.log.info("template plugin activated");
  ctx.api.statusIcon.set("idle");

  // --- statusIcon: reflect background work state in the sidebar dot ---
  // ctx.api.statusIcon.set("in-progress", "checking something...");
  // ctx.api.statusIcon.set("success");
  // ctx.api.statusIcon.set("error", "something went wrong");

  // --- modal: blocking-style dialogs, all return a Promise ---
  // await ctx.api.modal.info({ title: "Heads up", message: "Just so you know..." });
  // await ctx.api.modal.error({ title: "Failed", message: "Something broke." });
  // const choice = await ctx.api.modal.question({
  //   title: "Pick one",
  //   message: "Which do you want?",
  //   buttons: ["A", "B", "C"],
  // });
  // const confirmed = await ctx.api.modal.confirm({ title: "Delete?", message: "This can't be undone." });

  // --- toast: brief non-blocking notifications ---
  // ctx.api.toast.show({ message: "Saved", kind: "success" });

  // --- shell.exec: run a command and await its full output ---
  // const result = await ctx.api.shell.exec("git", ["status", "--short"], { cwd: "/some/repo" });
  // if (result.code !== 0) ctx.api.log.warn(`git status failed: ${result.stderr}`);

  // --- shell.spawn: stream output from a long-running process ---
  // const child = ctx.api.shell.spawn("git", ["log", "--oneline", "-20"], {
  //   onStdout: (chunk) => ctx.api.log.info(chunk),
  //   onStderr: (chunk) => ctx.api.log.warn(chunk),
  // });
  // const { code } = await child.done; // or child.kill() to stop it early

  // --- storage: per-plugin key/value JSON on disk (plaintext - no secrets) ---
  // await ctx.api.storage.set("lastRun", Date.now());
  // const lastRun = await ctx.api.storage.get<number>("lastRun");
  // const all = await ctx.api.storage.getAll();

  // --- fs: raw file access, namespaced under this plugin's own folder ---
  // const contents = await ctx.api.fs.readTextFile("notes.txt");
  // await ctx.api.fs.writeTextFile("notes.txt", "updated contents");
  // const entries = await ctx.api.fs.listDir("some-folder"); // [] if the folder doesn't exist yet
  // const rootPath = await ctx.api.fs.getRootPath(); // absolute path, e.g. for a spawned process's cwd
  // await ctx.api.fs.renameFile("notes.txt", "archive/notes.txt"); // creates the destination folder as needed
  // await ctx.api.fs.deleteFile("archive/notes.txt");
  // const unwatch = ctx.api.fs.watchFile("notes.txt", () => ctx.api.log.info("notes.txt changed"));
  // ctx.onDispose(unwatch);

  // --- theme: read the current palette and react to live changes ---
  // const currentPalette = ctx.api.theme.palette;
  // const unsubscribeTheme = ctx.api.theme.subscribe((palette) => {
  //   ctx.api.log.info(`theme changed: background=${palette.background}`);
  // });

  // --- tick: background work that keeps running while this plugin isn't
  //     the active sidebar selection (survives being unmounted, not survives
  //     the window being minimized for long periods - see architecture-plan.md) ---
  // ctx.tick.register(async () => {
  //   ctx.api.log.info("tick fired");
  // });
  // ctx.tick.setInterval(60_000); // recurring, every 60s
  // ctx.tick.requestWake(5_000); // one-off, 5s from now

  // --- signal: cancel in-flight async work on deactivate ---
  // fetch("https://example.com", { signal: ctx.signal }).catch(() => {});
}

export function deactivate() {
  // Undo anything activate() registered outside the tracked APIs (the host
  // auto-revokes tick registrations and aborts ctx.signal for you already).
}

const demoTabs = [
  { label: "Buttons", value: "buttons" },
  { label: "Form Controls", value: "form-controls" },
  { label: "Loading", value: "loading" },
  { label: "Dropdowns", value: "dropdowns" },
  { label: "Navigation", value: "navigation" },
  { label: "Overlays", value: "overlays" },
  { label: "Messaging", value: "messaging" },
  { label: "Calendar", value: "calendar" },
  { label: "Text Area", value: "text-area" },
];

export function Component({ api }: { api: PluginApi }) {
  const [count, setCount] = useState(0);
  const [demoTab, setDemoTab] = useState("buttons");
  const [page, setPage] = useState<"main" | "second-page">("main");

  // --- sidebar: register sub-items that render indented under this plugin's
  //     sidebar row. The plugin owns the full list, when it's non-empty
  //     (shown) vs. empty (hidden), and what each click does - here, flowing
  //     into one of the two example "pages" below by setting local state.
  //     Registered from Component (not activate()) since the items need to
  //     reach this component's own setPage - no cleanup call on unmount is
  //     needed, the host clears stale items itself on deactivate. ---
  useEffect(() => {
    api.sidebar.setItems([
      { id: "main", label: "Overview", color: "success", onClick: () => setPage("main") },
      { id: "second-page", label: "Second Page", onClick: () => setPage("second-page") },
    ]);
  }, [api]);

  if (page === "second-page") {
    return (
      <div>
        <h2>Second Page</h2>
        <p>This is a second page reached via a sidebar sub-item, not a tab.</p>
        <api.ui.Link label="Back to Overview" onClick={() => setPage("main")} />
      </div>
    );
  }

  return (
    <div>
      <h2>Template Plugin</h2>
      <p>This is a starting point, not a real plugin - copy this folder to build one.</p>
      <p>
        Count: {count} <button onClick={() => setCount((c) => c + 1)}>+1</button>
      </p>
      <api.ui.StatusDot color="idle" />

      {/* --- ui.TextBox: a shared controlled textarea primitive --- */}
      {/* const [text, setText] = useState("");
      <api.ui.TextBox value={text} onChange={setText} placeholder="type here" /> */}

      {/* --- Component Library showcase: see plugins/_template/demos/ ---
          One tab per category, added here every time a new host component
          ships (see CLAUDE.md's "Component Library" rule). --- */}
      <api.ui.Tabs tabs={demoTabs} value={demoTab} onChange={setDemoTab} />
      <div style={{ marginTop: 12 }}>
        {demoTab === "buttons" && <ButtonsDemo api={api} />}
        {demoTab === "form-controls" && <FormControlsDemo api={api} />}
        {demoTab === "loading" && <LoadingDemo api={api} />}
        {demoTab === "dropdowns" && <DropdownsDemo api={api} />}
        {demoTab === "navigation" && <NavigationDemo api={api} />}
        {demoTab === "overlays" && <OverlaysDemo api={api} />}
        {demoTab === "messaging" && <MessagingDemo api={api} />}
        {demoTab === "calendar" && <CalendarDemo api={api} />}
        {demoTab === "text-area" && <TextAreaDemo api={api} />}
      </div>
    </div>
  );
}
