import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../state/appStore";
import { InlineDialog } from "../../components/InlineDialog/InlineDialog";
import { TextButton } from "../../components/TextButton/TextButton";
import { Banner } from "../../components/Banner/Banner";
import { StepRow, type StepStatus } from "./StepRow";
import {
  HOST_REPO,
  PUBLISH_STEPS,
  getPluginsDir,
  preflight,
  type PublishContext,
  type PublishPlugin,
  type PublishPreflight,
} from "./publishPluginSteps";

/** Settings > Plugins > Publish. Opens a pull request against the Stewrd repo
 * that adds the plugin to docs/plugin-catalog.json (the marketplace list). */
export function PublishPluginModal({
  plugin,
  catalogIds,
  onClose,
}: {
  plugin: PublishPlugin | null;
  catalogIds: Set<string>;
  onClose: () => void;
}) {
  const palette = useAppStore((s) => s.palette);
  const [checks, setChecks] = useState<PublishPreflight | null>(null);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState("");

  useEffect(() => {
    setChecks(null);
    setPhase("setup");
    setStatuses({});
    setError(null);
    setPrUrl("");
    if (!plugin) return;
    let cancelled = false;
    getPluginsDir()
      .then((dir) => preflight(plugin, dir, catalogIds))
      .then((r) => !cancelled && setChecks(r))
      .catch((e) => !cancelled && setChecks({ ok: false, problems: [String(e)], owner: "", entry: null }));
    return () => {
      cancelled = true;
    };
  }, [plugin, catalogIds]);

  const busy = phase === "running" && !error;

  async function start() {
    if (!checks?.ok || !checks.entry) return;
    setPhase("running");
    setError(null);
    const ctx: PublishContext = { owner: checks.owner, entry: checks.entry };
    for (const step of PUBLISH_STEPS) {
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
    setPrUrl(ctx.prUrl ?? "");
    setPhase("done");
  }

  const checkStatus: StepStatus = checks === null ? "running" : checks.ok ? "done" : "error";

  return (
    <InlineDialog open={plugin !== null} onClose={() => !busy && onClose()} title="Publish To Marketplace">
      <div style={{ width: 460, maxWidth: "100%", fontSize: 13 }}>
        <p style={{ marginTop: 0, color: palette.textMuted }}>
          This opens a pull request against {HOST_REPO} that adds {plugin?.name ?? "your plugin"} to the marketplace
          catalog. Once it's merged, everyone can install it from the Marketplace.
        </p>

        <StepRow status={checkStatus} label="Plugin Is Ready To Publish" />
        {checks && !checks.ok && <Banner tone="warning" message={checks.problems.join(" ")} />}
        <StepRow
          status={phase === "setup" ? "pending" : "done"}
          label="Permission To Open A Pull Request"
          detail={checks?.ok ? `As ${checks.owner}, from ${checks.entry?.repo}` : undefined}
        />
        {PUBLISH_STEPS.map((s) => (
          <StepRow key={s.key} status={statuses[s.key] ?? "pending"} label={s.label} />
        ))}

        {error && <Banner tone="error" message={error} />}
        {phase === "done" && (
          <div style={{ border: `1px solid ${palette.status.success}`, borderRadius: 4, padding: 8, marginTop: 8 }}>
            <div style={{ color: palette.status.success }}>The pull request is open.</div>
            <div style={{ marginTop: 4 }}>The marketplace list updates once it's merged.</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          {phase === "done" && prUrl && <TextButton label="Open Pull Request" onClick={() => openUrl(prUrl).catch(() => {})} />}
          {phase !== "done" && (
            <TextButton
              label={error ? "Retry" : "Open Pull Request"}
              variant="primary"
              disabled={error ? false : !checks?.ok || busy}
              onClick={start}
            />
          )}
          <TextButton label={phase === "done" ? "Close" : "Cancel"} onClick={onClose} disabled={busy} />
        </div>
      </div>
    </InlineDialog>
  );
}
