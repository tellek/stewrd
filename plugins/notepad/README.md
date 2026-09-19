# Notepad

An Obsidian-style markdown notes plugin: multiple editing modes, rich markdown
formatting, wikilinks/backlinks, callouts, and an optional background process
that hands harvested notes to a headless `claude` CLI to build a personal
LLM wiki.

## Editing modes

- **Source** — raw markdown with syntax highlighting.
- **Live Preview** — same editor, but formatting marks (`**`, `*`, `` ` ``, `==`, `~~`) are hidden on every line except the one your cursor is on.
- **Reading** — fully rendered, non-editable.

## Markdown support

Bold/italic/bold+italic, strikethrough, highlight (`==text==`), inline code,
blockquotes, headings, ordered/unordered lists (Tab/Shift+Tab to nest,
Enter to auto-continue), checklists (`- [ ]`/`- [x]`, clickable in Reading
view), tables, fenced code blocks with language highlighting (JS/TS, Python,
CSS, HTML, JSON), footnotes (`[^1]` / `[^1]: text`), horizontal rules.

## Obsidian-like extensions

- Wikilinks: `[[Note Title]]` — click to open (creates the note if it doesn't exist yet).
- Embeds: `![[Note]]` / images / `![[Note^blockid]]`.
- Block references: `^blockid`.
- Callouts: `> [!note]`, `[!tip]`, `[!warning]`, etc. — foldable.
- Comments: `%%hidden%%` — parsed but never rendered.
- Properties: a leading `---\n...\n---` YAML frontmatter block, shown as a collapsible panel.
- Backlinks: every note referencing the currently open note, shown below the editor.

## Storage

Notes are plain `.md` files under this plugin's own sandboxed storage folder
(not the plugin's source directory in git), one file per note. A manifest
(`index.json`) the plugin maintains itself is the source of truth for the
note list, since it also created every note. Older single-note installs are
migrated automatically on first load.

**Clear** empties the active note. **Shift to harvest** moves the note's text
into a `harvest/` folder (as a timestamped file) and clears the editor —
harvested notes are picked up by the background wiki harvester below.

## Background LLM-wiki harvester

Disabled by default; enable it in the plugin's Settings panel. When enabled,
it checks `harvest/` on an interval (default 15 minutes) and, if there's
anything there, spawns `claude -p` with its working directory set to this
plugin's own storage folder, asking it to fold the harvested notes into a
`wiki/` folder of small, cross-linked pages (Karpathy-llm-wiki style).
Harvested content is treated as untrusted data in the prompt, not as
instructions. Processed files move to `processed/`; files that fail or
produce no wiki changes for 3 attempts in a row move to `failed/` instead of
being resubmitted forever.

## Settings

Default editor mode, autosave debounce, harvester enabled/interval, all
persisted via plugin storage and editable inline in the plugin's own
Settings panel.
