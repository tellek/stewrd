import { useMemo } from "react";
import { createRenderer, splitFrontmatter } from "./markdownRender";
import type { Palette } from "./editor";

export interface ReadingViewProps {
  content: string;
  palette: Palette;
  onChecklistToggle?: (index: number) => void;
}

export function ReadingView({ content, palette, onChecklistToggle }: ReadingViewProps) {
  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content]);
  const html = useMemo(() => createRenderer().render(body), [body]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const checkbox = (e.target as HTMLElement).closest("input.checklist-box");
    if (checkbox && onChecklistToggle) {
      const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll("input.checklist-box"));
      onChecklistToggle(all.indexOf(checkbox));
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: `${palette.border} ${palette.surface}` }}>
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
