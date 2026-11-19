import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';
import { vaultIndex } from '../lib/vault';

const api = window.api;

function score(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const i = n.indexOf(q);
  if (i >= 0) return 2 + i / 100;
  // fuzzy subsequence
  let j = 0;
  for (const ch of n) if (ch === q[j]) j++;
  return j === q.length ? 5 : Infinity;
}

export default function QuickSwitcher({ onOpen, onCreate, onClose, recent }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [content, setContent] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const q = query.trim().toLowerCase();

  const nameResults = useMemo(() => {
    if (!q) {
      const rec = recent.map((p) => vaultIndex.notes.find((n) => n.path === p)).filter(Boolean);
      return (rec.length ? rec : vaultIndex.notes.slice(0, 12)).map((n) => ({ ...n, kind: 'note' }));
    }
    return vaultIndex.notes
      .map((n) => ({ ...n, s: Math.min(score(n.name, q), score(n.rel, q) + 1) }))
      .filter((n) => n.s < Infinity)
      .sort((a, b) => a.s - b.s || a.name.length - b.name.length)
      .slice(0, 30)
      .map((n) => ({ ...n, kind: 'note' }));
  }, [q, recent]);

  // Full-text search (debounced)
  useEffect(() => {
    if (q.length < 2) { setContent([]); return; }
    const t = setTimeout(async () => {
      const res = await api.search(query.trim());
      setContent(res.filter((r) => r.snippet));
    }, 180);
    return () => clearTimeout(t);
  }, [q, query]);

  const results = useMemo(() => {
    const seen = new Set(nameResults.map((r) => r.path));
    const text = content.filter((c) => !seen.has(c.path)).slice(0, 20).map((c) => ({ ...c, kind: 'text' }));
    const list = [...nameResults, ...text];
    if (q && !vaultIndex.notes.some((n) => n.name.toLowerCase() === q)) list.push({ kind: 'create', name: query.trim() });
    return list;
  }, [nameResults, content, q, query]);

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (r) => {
    if (!r) return;
    if (r.kind === 'create') onCreate(r.name);
    else onOpen(r.path);
    onClose();
  };

  const highlight = (text) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="switcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="switcher-input">
          <Icon.search />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search or jump to a page…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); choose(results[index]); }
              else if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="switcher-list" ref={listRef}>
          {!q && results.length > 0 && <div className="switcher-section">{recent.length ? 'Recent' : 'Pages'}</div>}
          {results.map((r, i) => (
            <React.Fragment key={r.kind + (r.path || r.name)}>
              {r.kind === 'text' && (i === 0 || results[i - 1].kind !== 'text') && <div className="switcher-section">In page content</div>}
              <button
                data-i={i}
                className={`switcher-item${i === index ? ' active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(r)}
              >
                <span className="switcher-icon">{r.kind === 'create' ? <Icon.plus /> : <Icon.page />}</span>
                <span className="switcher-text">
                  <span className="switcher-title">
                    {r.kind === 'create' ? <>New page “{r.name}”</> : highlight(r.name)}
                  </span>
                  {r.kind === 'note' && r.rel.includes('\\') || r.kind === 'note' && r.rel.includes('/') ? (
                    <span className="switcher-sub">{r.rel.replace(/\.md$/i, '').replace(/\\/g, ' / ')}</span>
                  ) : null}
                  {r.kind === 'text' && <span className="switcher-sub">{highlight(r.snippet)}</span>}
                </span>
                {i === index && <span className="switcher-enter">↵</span>}
              </button>
            </React.Fragment>
          ))}
          {!results.length && <div className="switcher-empty">No pages yet</div>}
        </div>
        <div className="switcher-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
