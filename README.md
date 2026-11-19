# Local Notes

A clean, Notion-style editor for a folder of plain markdown files. Point it at any folder (including an existing Obsidian vault) and edit your notes without seeing markdown syntax.

## Run

```powershell
npm install      # first time only
npm start        # builds the UI and launches the app
```

`npm run app` launches without rebuilding. `npm run dist` (or `npm run dist:win`) builds a Windows installer into `release/`. On Linux, `npm run dist:linux` builds `.deb`, `.AppImage`, and `.tar.gz` packages into `release/`.

## Features

- **Any folder as a vault** – pick it on first launch; change it from the vault menu (top-left). The last vault and note are remembered.
- **Clean view or Markdown code (`Ctrl+E`)** – edit in the clean Notion-style view (headings, bold/italic/strike, code, lists, to-dos, quotes, tables, code blocks, dividers, images) or press `Ctrl+E` (or click the **Clean / Markdown** button in the top right) to view and edit the raw Markdown source file directly (including YAML frontmatter).
- **Slash menu** – type `/` on a line to insert blocks.
- **Selection toolbar** – select text to format, turn into a heading/list, or add a link.
- **Obsidian compatible** – `[[wikilinks]]` (type `[[` for page suggestions), `![[image.png]]` embeds, `> [!note]` callouts, YAML frontmatter (shown as properties in Clean view, editable in Markdown mode), footnotes, tags, and `==highlights==` are preserved as written.
- **Sidebar** – folders and pages, drag and drop to move, right-click to create, rename, delete (to Recycle Bin) or show in Explorer.
- **Search** – `Ctrl+P` searches page names and full text, or creates a new page.
- **Saving (`Ctrl+S`) & live reload** – in Clean view, changes autosave shortly after you stop typing (or immediately with `Ctrl+S`). In Markdown mode, the top bar shows `Unsaved • Ctrl+S` and saves when you press `Ctrl+S` (and also auto-flushes if you switch back to Clean view, change notes, or close the window). Files edited elsewhere (e.g. in Obsidian) reload automatically when there are no unsaved edits.
- **Paste or drop images** – saved into `attachments/` in your vault and embedded Obsidian-style.
- Light / dark / system theme.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+P` / `Ctrl+O` | Search / jump to page |
| `Ctrl+N` | New page |
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+E` | Toggle between Clean view and Markdown code |
| `Ctrl+S` | Save file in Markdown mode (or save immediately in Clean view) |
| `Tab` | Indent 2 spaces in Markdown mode |
| `/` | Block menu (Clean view) |
| `[[` | Link to a page (Clean view) |

## Notes

- Files are only rewritten when you edit them; just opening a note never changes it.
- When saving, the editor normalises some formatting, e.g. a to-do list directly followed by a bullet list gets a blank line between them. The content stays the same.
- `.obsidian`, `.git`, `.trash` and hidden folders are ignored.
