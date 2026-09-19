import { useMemo } from "react";
import { createRenderer, splitFrontmatter } from "./markdownRender";
import type { Manifest } from "./vault";

export interface ReadingViewProps {
  content: string;
  manifest: Manifest;
  onWikilinkClick?: (target: string) => void;
  onChecklistToggle?: (index: number) => void;
}

export function ReadingView({ content, manifest, onWikilinkClick, onChecklistToggle }: ReadingViewProps) {
  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content]);
  const html = useMemo(() => createRenderer(manifest).render(body), [manifest, body]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest("[data-wikilink]");
    if (target && onWikilinkClick) {
      e.preventDefault();
      onWikilinkClick(target.getAttribute("data-wikilink") || "");
      return;
    }
    const checkbox = (e.target as HTMLElement).closest("input.checklist-box");
    if (checkbox && onChecklistToggle) {
      const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll("input.checklist-box"));
      onChecklistToggle(all.indexOf(checkbox));
    }
  }

  return (
    <div>
      {frontmatter && (
        <details>
          <summary>Properties</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{frontmatter}</pre>
        </details>
      )}
      {/* eslint-disable-next-line react/no-danger -- html is produced by our
          own escaping markdown-it renderer (html:false + manual escapeHtml
          on every custom rule); see markdownRender.ts */}
      <div className="notepad-reading" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
