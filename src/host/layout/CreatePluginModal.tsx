import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../state/appStore";
import { InlineDialog } from "../../components/InlineDialog/InlineDialog";
import { TextBox } from "../../components/TextBox/TextBox";
import { TextButton } from "../../components/TextButton/TextButton";
import { Banner } from "../../components/Banner/Banner";
import { STEPS, checkName, checkPrerequisites, slugify, type NameCheck, type Prerequisites } from "./createPluginSteps";

type Status = "pending" | "running" | "done" | "error";

function Row({ status, label, detail }: { status: Status; label: string; detail?: string }) {
  const palette = useAppStore((s) => s.palette);
  const glyph = { pending: "○", running: "…", done: "✓", error: "✕" }[status];
  const color = {
    pending: palette.textMuted,
    running: palette.status["in-progress"],
    done: palette.status.success,
    error: palette.status.error,
  }[status];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
      <span aria-hidden style={{ color, width: 16, textAlign: "center", fontWeight: 600 }}>
        {glyph}
      </span>
      <div>
        <div style={{ color: status === "pending" ? palette.textMuted : palette.text }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: status === "error" ? palette.status.error : palette.textMuted }}>{detail}</div>}
      </div>
    </div>
  );
}

/** Settings > Plugins > Create New Plugin. A checklist that walks through
 * creating a GitHub repo, cloning it into the plugins folder, writing the
 * Hello World template into it and pushing - see createPluginSteps.ts. */
export function CreatePluginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const palette = useAppStore((s) => s.palette);
  const [prereq, setPrereq] = useState<Prerequisites | null>(null);
  const [name, setName] = useState("");
  const [nameCheck, setNameCheck] = useState<NameCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const confirmed = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPrereq(null);
    setName("");
    setNameCheck(null);
    setPhase("setup");
    setStatuses({});
    setError(null);
    confirmed.current = false;
    let cancelled = false;
    checkPrerequisites()
      .then((p) => !cancelled && setPrereq(p))
      .catch((e) => !cancelled && setPrereq({ ok: false, problems: [String(e)], owner: "" }));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Re-validate the name shortly after typing stops.
  useEffect(() => {
    setNameCheck(null);
    if (!prereq?.ok || !name.trim()) return;
    setChecking(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      checkName(prereq.owner, name)
        .then((r) => !cancelled && setNameCheck(r))
        .catch((e) => !cancelled && setNameCheck({ kind: "invalid", message: String(e) }))
        .finally(() => !cancelled && setChecking(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [name, prereq]);

  const ready = prereq?.ok === true && nameCheck !== null && nameCheck.kind !== "invalid";
  const id = nameCheck && nameCheck.kind !== "invalid" ? nameCheck.id : slugify(name);
  const repo = `${prereq?.owner ?? ""}/stewrd-${id}`;

  async function start() {
    if (!ready || !prereq) return;
    confirmed.current = true;
    setPhase("running");
    setError(null);
    let pluginsDir: string;
    try {
      pluginsDir = await invoke<string>("get_plugins_dir");
    } catch (e) {
      setError(String(e));
      return;
    }
    const ctx = { owner: prereq.owner, id, name, pluginsDir };
    for (const step of STEPS) {
      if (statuses[step.key] === "done") continue;
      setStatuses((s) => ({ ...s, [step.key]: "running" }));
      try {
        await step.run(ctx);
        setStatuses((s) => ({ ...s, [step.key]: "done" }));
      } catch (e) {
        setStatuses((s) => ({ ...s, [step.key]: "error" }));
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setFolder(pluginsDir + (pluginsDir.includes("\\") ? "\\" : "/") + id);
    setPhase("done");
  }

  const busy = phase === "running" && !error;
  const prereqStatus: Status = prereq === null ? "running" : prereq.ok ? "done" : "error";
  const nameStatus: Status = ready ? "done" : nameCheck?.kind === "invalid" ? "error" : "pending";
  const permissionStatus: Status = phase === "setup" ? "pending" : "done";

  return (
    <InlineDialog open={open} onClose={() => !busy && onClose()} title="Create New Plugin">
      <div style={{ width: 460, maxWidth: "100%", fontSize: 13 }}>
        <p style={{ marginTop: 0, color: palette.textMuted }}>
          This creates a public GitHub repository for your plugin, clones it into your plugins folder, adds a working
          Hello World plugin and pushes it. It uses your signed-in GitHub CLI.
        </p>

        <Row
          status={prereqStatus}
          label="GitHub CLI And Git Ready"
          detail={prereq && !prereq.ok ? undefined : prereq?.owner ? `Signed in as ${prereq.owner}` : undefined}
        />
        {prereq && !prereq.ok && (
          <Banner tone="warning" message={prereq.problems.join(" ")} />
        )}

        <Row
          status={nameStatus}
          label="Name Your Plugin"
          detail={
            nameCheck?.kind === "invalid"
              ? nameCheck.message
              : nameCheck?.kind === "resume"
                ? `Resuming an unfinished ${repo}`
                : checking
                  ? "Checking..."
                  : undefined
          }
        />
        {phase === "setup" && (
          <div style={{ margin: "4px 0 8px 24px" }}>
            <TextBox value={name} onChange={setName} placeholder="My Plugin" singleLine />
          </div>
        )}

        <Row
          status={permissionStatus}
          label="Permission To Create The Repository"
          detail={ready ? `Creates ${repo} (public) on GitHub` : undefined}
        />
        <Row status={statuses.repo ?? "pending"} label="Repository Created" />
        <Row status={statuses.clone ?? "pending"} label="Cloned Into The Plugins Folder" />
        <Row status={statuses.scaffold ?? "pending"} label="Hello World Plugin Created" />
        <Row status={statuses.push ?? "pending"} label="Committed And Pushed To Main" />

        {error && <Banner tone="error" message={error} />}

        {phase === "done" && (
          <div style={{ border: `1px solid ${palette.status.success}`, borderRadius: 4, padding: 8, marginTop: 8 }}>
            <div style={{ color: palette.status.success }}>Your plugin is complete and ready to be worked on.</div>
            <div style={{ marginTop: 4 }}>
              It lives in <code>{folder}</code>. Open that folder with an AI coding assistant and ask it to build
              something, or edit <code>index.tsx</code> by hand if you're feeling frisky. See{" "}
              <code>plugins/CLAUDE.md</code> for the plugin API.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          {phase === "done" && <TextButton label="Show In Folder" onClick={() => revealItemInDir(folder).catch(() => {})} />}
          {phase !== "done" && (
            <TextButton
              label={error ? "Retry" : "Create Repository And Plugin"}
              variant="primary"
              disabled={error ? false : !ready || busy}
              onClick={start}
            />
          )}
          <TextButton label={phase === "done" ? "Close" : "Cancel"} onClick={onClose} disabled={busy} />
        </div>
      </div>
    </InlineDialog>
  );
}
