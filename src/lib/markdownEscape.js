import { MarkdownSerializerState } from 'prosemirror-markdown';

// prosemirror-markdown escapes aggressively ([, ], _, *, #, …) which would litter
// an Obsidian vault with backslashes (and break [[wikilinks]], footnotes, callouts).
// This escaper only escapes what would actually change meaning when re-parsed.
function minimalEsc(str, startOfLine = false) {
  // Backslash only matters before ASCII punctuation.
  str = str.replace(/\\(?=[!-\/:-@\[-`{-~])/g, '\\\\');
  str = str.replace(/`/g, '\\`');
  // Emphasis markers: escape unless surrounded by whitespace (or intraword underscore).
  str = str.replace(/\*/g, (m, i, s) => {
    const before = s[i - 1];
    const after = s[i + 1];
    if ((before === undefined || /\s/.test(before)) && (after === undefined || /\s/.test(after))) return m;
    return '\\*';
  });
  str = str.replace(/_/g, (m, i, s) => {
    const before = s[i - 1] || ' ';
    const after = s[i + 1] || ' ';
    if (/[A-Za-z0-9]/.test(before) && /[A-Za-z0-9]/.test(after)) return m;
    if (/\s/.test(before) && /\s/.test(after)) return m;
    return '\\_';
  });
  str = str.replace(/~~/g, '\\~\\~');
  if (this && this.inTable) str = str.replace(/\|/g, '\\|');
  if (startOfLine) {
    str = str
      .replace(/^(\s*)([-+*>])(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*)(---+|===+)\s*$/, '$1\\$2');
  }
  return str;
}

let patched = false;
export function patchMarkdownEscaping() {
  if (patched) return;
  patched = true;
  MarkdownSerializerState.prototype.esc = minimalEsc;
}
