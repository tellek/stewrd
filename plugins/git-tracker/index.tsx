/// <reference path="../.stewrd/plugin-api.d.ts" />
import { useEffect, useState } from "react";
import type { PluginContext, PluginApi } from "stewrd-plugin-api";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const INTERVAL_KEY = "git-tracker";
const POLL_MS = 60_000;
const REPO_PATH_STORAGE_KEY = "repoPath";

interface CheckResult {
  timestamp: number;
  statusOutput: string;
  lastCommit: string;
  error?: string;
}

let lastResult: CheckResult | null = null;
const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

let currentApi: PluginApi | null = null;
let currentRepoPath: string | null = null;

async function checkNow() {
  if (!currentApi || !currentRepoPath) return;
  const api = currentApi;
  api.statusIcon.set("in-progress", "checking repo...");
  try {
    const status = await api.shell.exec("git", ["status", "--short"], { cwd: currentRepoPath });
    if (status.code !== 0) throw new Error(status.stderr || `git status exited ${status.code}`);
    const log = await api.shell.exec("git", ["log", "-1", "--oneline"], { cwd: currentRepoPath });
    lastResult = {
      timestamp: Date.now(),
      statusOutput: status.stdout.trim() || "(clean)",
      lastCommit: log.stdout.trim(),
    };
    api.statusIcon.set(
      status.stdout.trim() ? "warning" : "success",
      status.stdout.trim() ? "uncommitted changes" : "clean",
    );
  } catch (err) {
    lastResult = { timestamp: Date.now(), statusOutput: "", lastCommit: "", error: String(err) };
    api.statusIcon.set("error", "check failed");
  }
  notify();
}

export function activate(ctx: PluginContext) {
  currentApi = ctx.api;

  ctx.api.storage.get<string>(REPO_PATH_STORAGE_KEY).then((saved) => {
    currentRepoPath = saved ?? null;
    notify();
    if (currentRepoPath) checkNow();
  });

  // Reliable background polling: a Rust-side tokio::interval, NOT the JS tick
  // scheduler - WebView2/WKWebView throttle JS timers when minimized/occluded
  // (see docs/architecture-plan.md "Tick scheduler"), so this is the pattern
  // for background work that must survive that.
  invoke("start_interval", { key: INTERVAL_KEY, intervalMs: POLL_MS });
  const unlistenPromise = listen(`interval-tick:${INTERVAL_KEY}`, () => checkNow());

  // Lighter continuous work (driving the "seconds since last check" display)
  // still goes through the normal JS tick scheduler - fine for non-critical
  // UI refresh, and exercises it under real recurring load.
  ctx.tick.register(() => notify());
  ctx.tick.setInterval(1000);

  ctx.onDispose(() => {
    invoke("stop_interval", { key: INTERVAL_KEY });
    unlistenPromise.then((unlisten) => unlisten());
  });
}

export function deactivate() {
  currentApi = null;
}

function useLastResult(): CheckResult | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return lastResult;
}

export function Component({ api }: { api: PluginApi }) {
  const [repoPath, setRepoPath] = useState("");
  const [loaded, setLoaded] = useState(false);
  const result = useLastResult();
  const [asking, setAsking] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState("");

  useEffect(() => {
    api.storage.get<string>(REPO_PATH_STORAGE_KEY).then((saved) => {
      setRepoPath(saved ?? "");
      setLoaded(true);
    });
  }, [api]);

  async function saveRepoPath() {
    await api.storage.set(REPO_PATH_STORAGE_KEY, repoPath);
    currentRepoPath = repoPath;
    checkNow();
  }

  async function askClaude() {
    if (!result) return;
    setAsking(true);
    setClaudeResponse("");
    const prompt =
      "In one short sentence, summarize this git repo's current state for a busy developer:\n\n" +
      `Status:\n${result.statusOutput}\n\nLast commit:\n${result.lastCommit}`;
    const child = api.shell.spawn("claude", ["-p", prompt], {
      onStdout: (chunk) => setClaudeResponse((prev) => prev + chunk),
      onStderr: (chunk) => api.log.warn(chunk),
    });
    await child.done;
    setAsking(false);
  }

  if (!loaded) return <p>Loading...</p>;

  return (
    <div>
      <h2>Git Tracker</h2>
      <p>Polls a repo every 60s via a Rust-side interval (survives the window being minimized).</p>
      <api.ui.TextBox value={repoPath} onChange={setRepoPath} rows={1} placeholder="C:\path\to\repo" />
      <p>
        <button onClick={saveRepoPath}>Save repo path</button>{" "}
        <button onClick={checkNow} disabled={!repoPath}>
          Check now
        </button>
      </p>
      {result && (
        <div>
          <p>Last checked: {new Date(result.timestamp).toLocaleTimeString()}</p>
          {result.error ? (
            <p style={{ color: "#ef4444" }}>{result.error}</p>
          ) : (
            <>
              <pre>{result.statusOutput}</pre>
              <p>Last commit: {result.lastCommit}</p>
              <button onClick={askClaude} disabled={asking}>
                {asking ? "Asking Claude..." : "Ask Claude about repo status"}
              </button>
              {claudeResponse && <p>{claudeResponse}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
