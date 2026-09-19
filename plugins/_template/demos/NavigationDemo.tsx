import { useState } from "react";
import type { PluginApi } from "stewrd-plugin-api";

/** Demonstrates api.ui.Tabs / Pagination / Menu / Link. */
export function NavigationDemo({ api }: { api: PluginApi }) {
  const [tab, setTab] = useState("one");
  const [page, setPage] = useState(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <api.ui.Tabs
        tabs={[
          { label: "One", value: "one" },
          { label: "Two", value: "two" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <api.ui.Pagination page={page} pageCount={5} onChange={setPage} />
      <api.ui.Menu
        trigger={<api.ui.TextButton label="Menu" onClick={() => {}} />}
        items={[
          { label: "Action 1", onClick: () => api.log.info("action 1") },
          { label: "Action 2", onClick: () => api.log.info("action 2") },
          { label: "Disabled", onClick: () => {}, disabled: true },
        ]}
      />
      <api.ui.Link label="A styled link" onClick={() => api.log.info("link clicked")} />
    </div>
  );
}
