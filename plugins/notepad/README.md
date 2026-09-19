# Notepad

A single, unnamed, autosaving markdown note with rich formatting, Obsidian-
style syntax, and an optional background process that hands harvested notes
to a headless `claude` CLI to build a personal LLM wiki.

## Editing modes

Tabs at the top switch between:

- **Source** — raw markdown with syntax highlighting.
- **Live Preview** — same editor, but formatting marks (`**`, `*`, `` ` ``, `==`, `~~`) are hidden on every line except the one your cursor is on.
- **Reading** — fully rendered, non-editable (checkboxes are still clickable here).

**Clear** and **Shift** sit on the same row as the tabs, right-aligned.
**Clear** empties the note. **Shift** moves the note's text into a `harvest/`
folder (as a timestamped file) and clears the note — harvested notes are
picked up by the background wiki harvester below.

## Markdown support

Bold/italic/bold+italic, strikethrough, highlight (`==text==`), inline code,
blockquotes, headings, ordered/unordered lists (Tab/Shift+Tab to nest,
Enter to auto-continue), checklists (`- [ ]`/`- [x]`), tables, fenced code
blocks with language highlighting (JS/TS, Python, CSS, HTML, JSON),
footnotes (`[^1]` / `[^1]: text`), horizontal rules, callouts (`> [!note]`,
`[!tip]`, `[!warning]`, etc.), comments (`%%hidden%%`), and a leading YAML
frontmatter block shown as a collapsible properties panel. Wikilinks
(`[[...]]`) and embeds (`![[...]]`) render with Obsidian-like styling but
aren't navigable — there's no multi-note vault in this plugin.

## Storage

The note is a single plain `.md` file under this plugin's own sandboxed
storage folder (not the plugin's source directory in git). Autosaves 1
second after you stop typing, even if focus has moved elsewhere — the save
timer isn't tied to DOM focus, and a pending save is flushed immediately if
you navigate away from the plugin before it fires. Older multi-note/KV-based
installs are migrated automatically on first load.

## Settings

This plugin has no in-app settings UI — every option lives in its own
`settings.json`, editable via **Settings > Plugins > Configure**:

```json
{
  "defaultMode": "live-preview",
  "autosaveDebounceMs": 1000,
  "harvesterEnabled": false,
  "harvesterIntervalMs": 900000
}
```

## Background LLM-wiki harvester

Disabled by default (`harvesterEnabled: false`). When enabled, it checks
`harvest/` on an interval (`harvesterIntervalMs`, default 15 minutes) and,
if there's anything there, spawns `claude -p` with its working directory
set to this plugin's own storage folder, asking it to fold the harvested
notes into a `wiki/` folder of small, cross-linked pages (Karpathy-llm-wiki
style). Harvested content is treated as untrusted data in the prompt, not as
instructions. Processed files move to `processed/`; files that fail or
produce no wiki changes for 3 attempts in a row move to `failed/` instead of
being resubmitted forever.
