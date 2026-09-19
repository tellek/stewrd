// Reading-view / live-preview HTML rendering. `html: false` keeps markdown-it
// from ever passing raw HTML through untouched - every custom rule below
// must still escape any interpolated token text itself (title, target, url)
// before building its output HTML string, since notes (including ones a
// headless `claude` writes into wiki/) are untrusted content rendered inside
// a webview that has full Tauri IPC access.
import MarkdownIt from "markdown-it";
import type { MarkdownIt as MarkdownItInstance } from "markdown-it";
import type { Manifest } from "./vault";

const CALLOUT_KINDS = new Set(["note", "tip", "warning", "important", "caution", "success", "question"]);

export function createRenderer(manifest: Manifest): MarkdownItInstance {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

  // Strikethrough is built in; add highlight (==text==) as a simple inline rule.
  md.inline.ruler.before("emphasis", "highlight", (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== "==") return false;
    const end = state.src.indexOf("==", start + 2);
    if (end === -1) return false;
    const content = state.src.slice(start + 2, end);
    if (!content) return false;
    if (!silent) {
      const token = state.push("highlight_open", "mark", 1);
      token.markup = "==";
      const text = state.push("text", "", 0);
      text.content = content;
      state.push("highlight_close", "mark", -1);
    }
    state.pos = end + 2;
    return true;
  });

  // Comments (%%hidden%%) - parsed but rendered as nothing.
  md.inline.ruler.before("text", "comment", (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== "%%") return false;
    const end = state.src.indexOf("%%", start + 2);
    if (end === -1) return false;
    if (!silent) state.push("comment", "", 0);
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.comment = () => "";

  // Wikilinks [[Note]] / [[Note|Alias]] and embeds ![[Note]].
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const start = state.pos;
    const isEmbed = state.src[start] === "!" && state.src.slice(start + 1, start + 3) === "[[";
    const linkStart = isEmbed ? start + 1 : start;
    if (state.src.slice(linkStart, linkStart + 2) !== "[[") return false;
    const end = state.src.indexOf("]]", linkStart + 2);
    if (end === -1) return false;
    const inner = state.src.slice(linkStart + 2, end);
    if (!inner.trim()) return false;
    if (!silent) {
      const [targetPart, aliasPart] = inner.split("|");
      const [target, blockRef] = targetPart.split("^");
      const token = state.push(isEmbed ? "wikiembed" : "wikilink", "", 0);
      token.meta = { target: target.trim(), alias: aliasPart?.trim(), blockRef: blockRef?.trim() };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, alias } = tokens[idx].meta as { target: string; alias?: string };
    const exists = manifest.notes.some((n) => n.title.trim().toLowerCase() === target.toLowerCase());
    const label = md.utils.escapeHtml(alias || target);
    const safeTarget = md.utils.escapeHtml(target);
    const cls = exists ? "wikilink" : "wikilink wikilink-missing";
    return `<a class="${cls}" data-wikilink="${safeTarget}" href="#">${label}</a>`;
  };
  md.renderer.rules.wikiembed = (tokens, idx) => {
    const { target } = tokens[idx].meta as { target: string };
    const safeTarget = md.utils.escapeHtml(target);
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(target)) {
      return `<img class="embed-image" data-embed="${safeTarget}" alt="${safeTarget}" src="" />`;
    }
    return `<div class="embed-note" data-embed="${safeTarget}">Embed: ${safeTarget}</div>`;
  };

  // Block references (^blockid) - rendered as an invisible anchor.
  md.inline.ruler.push("blockref", (state, silent) => {
    const match = /^\^([a-zA-Z0-9-]+)/.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("blockref", "", 0);
      token.meta = { id: match[1] };
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.blockref = (tokens, idx) => {
    const id = md.utils.escapeHtml((tokens[idx].meta as { id: string }).id);
    return `<span id="block-${id}" class="block-ref-anchor"></span>`;
  };

  // Callouts: a blockquote whose first line is `[!kind] Title`, foldable.
  const defaultBlockquoteOpen = md.renderer.rules.blockquote_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.core.ruler.push("callout", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      const firstParagraph = tokens[i + 2]; // blockquote_open, paragraph_open, inline
      if (!firstParagraph || firstParagraph.type !== "inline") continue;
      const match = /^\[!(\w+)]\s*(.*)$/.exec(firstParagraph.content);
      if (!match) continue;
      const kind = match[1].toLowerCase();
      if (!CALLOUT_KINDS.has(kind)) continue;
      tokens[i].meta = { callout: kind, title: match[2] || kind };
      firstParagraph.content = "";
      firstParagraph.children = [];
    }
  });
  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const meta = tokens[idx].meta as { callout?: string; title?: string } | undefined;
    if (!meta?.callout) return defaultBlockquoteOpen(tokens, idx, options, env, self);
    const title = md.utils.escapeHtml(meta.title || meta.callout);
    const kind = md.utils.escapeHtml(meta.callout);
    return `<div class="callout callout-${kind}"><div class="callout-title" data-callout-toggle>${title}</div><div class="callout-body">`;
  };
  const defaultBlockquoteClose = md.renderer.rules.blockquote_close ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
    // Matching open is tracked via nesting; markdown-it doesn't give us the
    // paired open token here, so we close with the same generic </div></div>
    // for every blockquote_close that followed a callout open. Since
    // callouts and plain blockquotes never nest into each other at the same
    // level ambiguously for this simple renderer, this is safe in practice.
    let depth = 0;
    for (let i = idx; i >= 0; i--) {
      if (tokens[i].type === "blockquote_close") depth++;
      else if (tokens[i].type === "blockquote_open") {
        if (depth === 0) return tokens[i].meta ? "</div></div>" : defaultBlockquoteClose(tokens, idx, options, env, self);
        depth--;
      }
    }
    return defaultBlockquoteClose(tokens, idx, options, env, self);
  };

  // Checklists: render `- [ ]`/`- [x]` list items with a real checkbox.
  md.core.ruler.push("checklist", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "list_item_open") continue;
      const inline = tokens[i + 2];
      if (!inline || inline.type !== "inline") continue;
      const match = /^\[([ xX])]\s(.*)$/.exec(inline.content);
      if (!match) continue;
      const checked = match[1].toLowerCase() === "x";
      tokens[i].attrSet("class", `checklist-item ${checked ? "checked" : "unchecked"}`);
      inline.content = match[2];
      const checkboxToken = new state.Token("checklist_box", "", 0);
      checkboxToken.meta = { checked };
      inline.children?.unshift(checkboxToken);
    }
  });
  md.renderer.rules.checklist_box = (tokens, idx) => {
    const { checked } = tokens[idx].meta as { checked: boolean };
    return `<input type="checkbox" class="checklist-box" ${checked ? "checked" : ""} />`;
  };

  // Footnotes: minimal support for [^id] refs and `[^id]: text` definitions.
  md.core.ruler.push("footnote_defs", (state) => {
    const defRe = /^\[\^([^\]]+)]:\s*(.*)$/;
    const defs: Record<string, string> = {};
    for (const token of state.tokens) {
      if (token.type !== "inline") continue;
      const match = defRe.exec(token.content);
      if (match) defs[match[1]] = match[2];
    }
    (state.env as Record<string, unknown>).footnoteDefs = defs;
  });
  md.inline.ruler.before("text", "footnote_ref", (state, silent) => {
    const match = /^\[\^([^\]]+)]/.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (/^\[\^[^\]]+]:/.test(state.src.slice(state.pos))) return false; // definition, not a ref
    if (!silent) {
      const token = state.push("footnote_ref", "", 0);
      token.meta = { id: match[1] };
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const id = md.utils.escapeHtml((tokens[idx].meta as { id: string }).id);
    return `<sup class="footnote-ref" id="fnref-${id}"><a href="#fn-${id}">[${id}]</a></sup>`;
  };

  return md;
}

/** Strips a leading `---\n...\n---` frontmatter block, returning it separately. */
export function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: null, body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}
