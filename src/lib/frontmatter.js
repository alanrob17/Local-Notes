// Split YAML frontmatter from a markdown document so the editor never touches it.
const FM = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(text) {
  const m = text.match(FM);
  if (!m) return { frontmatter: '', body: text };
  return { frontmatter: m[0].endsWith('\n') ? m[0] : m[0] + '\n', body: text.slice(m[0].length) };
}

export function parseProperties(frontmatter) {
  // Lightweight display-only parsing of simple "key: value" pairs and lists.
  if (!frontmatter) return [];
  const lines = frontmatter.replace(/^\uFEFF?---.*\r?\n/, '').replace(/\r?\n(---|\.\.\.)\s*\r?\n?$/, '').split(/\r?\n/);
  const props = [];
  let current = null;
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
    if (kv) {
      let val = kv[2].trim();
      if (/^\[.*\]$/.test(val)) val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else val = val.replace(/^["']|["']$/g, '');
      current = { key: kv[1].trim(), value: val };
      props.push(current);
    } else if (current && /^\s*-\s+/.test(line)) {
      const item = line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!Array.isArray(current.value)) current.value = current.value ? [current.value] : [];
      current.value.push(item);
    }
  }
  return props;
}
