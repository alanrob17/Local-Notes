// Shared, mutable vault index used by editor extensions (wikilink resolution, image embeds, page suggestions).
export const vaultIndex = {
  root: '',
  notes: [], // { name, path, rel }
  attachments: [], // { name, path }
  currentNotePath: '',
};

const sep = (p) => (p.includes('\\') ? '\\' : '/');

export function dirname(p) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(0, i) : p;
}
export function basename(p) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(i + 1) : p;
}
export function joinPath(dir, rel) {
  const s = sep(dir);
  const leadingSlash = dir.startsWith('/') ? '/' : '';
  const parts = dir.split(/[\\/]/).filter(Boolean);
  for (const seg of rel.split(/[\\/]/)) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return leadingSlash + parts.join(s);
}
export function relPath(root, p) {
  if (!root) return p;
  return p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
}

export function flattenTree(tree) {
  const notes = [];
  const attachments = [];
  const walk = (items) => {
    for (const it of items) {
      if (it.type === 'folder') walk(it.children);
      else if (it.type === 'file') notes.push({ name: it.name, path: it.path, rel: relPath(vaultIndex.root, it.path) });
      else if (it.type === 'attachment') attachments.push({ name: it.name, path: it.path });
    }
  };
  walk(tree);
  return { notes, attachments };
}

export function vaultUrl(absPath) {
  return 'vault://local/' + encodeURIComponent(absPath);
}

// Resolve an Obsidian link target like "Folder/Note#Heading" to a note path.
export function resolveNote(target) {
  const clean = target.split('#')[0].split('^')[0].trim().replace(/\.md$/i, '');
  if (!clean) return null;
  const lower = clean.toLowerCase().replace(/\\/g, '/');
  const byRel = vaultIndex.notes.find((n) => n.rel.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase() === lower);
  if (byRel) return byRel.path;
  const last = lower.split('/').pop();
  const candidates = vaultIndex.notes.filter((n) => n.name.toLowerCase() === last);
  if (!candidates.length) return null;
  // Prefer a note in the same folder as the current note.
  const curDir = vaultIndex.currentNotePath ? dirname(vaultIndex.currentNotePath) : '';
  return (candidates.find((c) => dirname(c.path) === curDir) || candidates[0]).path;
}

export function resolveAttachment(name) {
  const clean = name.split('|')[0].trim();
  const lower = clean.toLowerCase().replace(/\\/g, '/');
  const last = lower.split('/').pop();
  const hit =
    vaultIndex.attachments.find((a) => relPath(vaultIndex.root, a.path).replace(/\\/g, '/').toLowerCase() === lower) ||
    vaultIndex.attachments.find((a) => a.name.toLowerCase() === last);
  return hit ? hit.path : null;
}

// Resolve a markdown image/link src relative to the current note.
export function resolveRelative(src) {
  if (!src || /^(https?:|data:|vault:|mailto:)/i.test(src)) return src;
  let decoded = src;
  try { decoded = decodeURIComponent(src); } catch {}
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('/')) return decoded; // absolute windows or posix path
  const base = vaultIndex.currentNotePath ? dirname(vaultIndex.currentNotePath) : vaultIndex.root;
  return joinPath(base, decoded);
}

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
