import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import QuickSwitcher from './components/QuickSwitcher';
import { Icon } from './components/Icons';
import { vaultIndex, flattenTree, resolveNote, relPath, dirname, joinPath } from './lib/vault';

const api = window.api;
const THEMES = ['system', 'light', 'dark'];

function replacePrefix(p, oldPrefix, newPrefix) {
  if (!p) return p;
  if (p === oldPrefix) return newPrefix;
  if (p.startsWith(oldPrefix + '\\') || p.startsWith(oldPrefix + '/')) return newPrefix + p.slice(oldPrefix.length);
  return p;
}

export default function App() {
  const [vault, setVault] = useState(undefined); // undefined = loading, null = none
  const [tree, setTree] = useState([]);
  const [current, setCurrent] = useState(null); // { path, key }
  const [status, setStatus] = useState('saved');
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== '0');
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('sidebarWidth')) || 260);
  const [markdownMode, setMarkdownMode] = useState(() => localStorage.getItem('markdownMode') === '1');
  const [spellcheck, setSpellcheck] = useState(() => localStorage.getItem('spellcheck') !== '0');
  const [switcher, setSwitcher] = useState(false);
  const [theme, setTheme] = useState('system');
  const [recent, setRecent] = useState([]);
  const currentRef = useRef(current);
  currentRef.current = current;

  // ----- boot -----
  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.theme) setTheme(s.theme);
      if (typeof s.spellcheck === 'boolean') setSpellcheck(s.spellcheck);
    });
    api.getLastVault().then((v) => setVault(v || null));
  }, []);

  useEffect(() => localStorage.setItem('sidebarOpen', sidebarOpen ? '1' : '0'), [sidebarOpen]);
  useEffect(() => localStorage.setItem('sidebarWidth', String(sidebarWidth)), [sidebarWidth]);
  useEffect(() => localStorage.setItem('markdownMode', markdownMode ? '1' : '0'), [markdownMode]);
  useEffect(() => {
    localStorage.setItem('spellcheck', spellcheck ? '1' : '0');
    api.setSpellcheck?.(spellcheck);
  }, [spellcheck]);

  const refreshTree = useCallback(async () => {
    const t = await api.getTree();
    const { notes, attachments } = flattenTree(t);
    vaultIndex.notes = notes;
    vaultIndex.attachments = attachments;
    setTree(t);
    return notes;
  }, []);

  const openPath = useCallback((p, { keepKey = false } = {}) => {
    if (!p) { setCurrent(null); return; }
    if (!keepKey) setStatus('saved');
    setCurrent((c) => (keepKey && c ? { ...c, path: p } : { path: p, key: `${p}:${Date.now()}` }));
    if (vaultIndex.root) localStorage.setItem(`last:${vaultIndex.root}`, p);
    setRecent((r) => {
      const next = [p, ...r.filter((x) => x !== p)].slice(0, 12);
      if (vaultIndex.root) localStorage.setItem(`recent:${vaultIndex.root}`, JSON.stringify(next));
      return next;
    });
  }, []);

  // When a vault is opened: load tree and restore last note.
  useEffect(() => {
    if (!vault) return;
    vaultIndex.root = vault.path;
    setCurrent(null);
    let rec = [];
    try { rec = JSON.parse(localStorage.getItem(`recent:${vault.path}`) || '[]'); } catch {}
    setRecent(rec);
    refreshTree().then((notes) => {
      const last = localStorage.getItem(`last:${vault.path}`);
      if (last && notes.some((n) => n.path === last)) openPath(last);
    });
  }, [vault, refreshTree, openPath]);

  // Keep tree in sync with disk changes.
  useEffect(() => {
    if (!vault) return;
    return api.onVaultChanged(async () => {
      const notes = await refreshTree();
      const cur = currentRef.current;
      if (cur && !notes.some((n) => n.path === cur.path)) {
        // The open file disappeared (deleted / renamed outside the app).
        const still = await api.stat(cur.path);
        if (!still) setCurrent(null);
      }
      setRecent((r) => r.filter((p) => notes.some((n) => n.path === p)));
    });
  }, [vault, refreshTree]);

  // ----- actions -----
  const chooseVault = async () => {
    const v = await api.selectVault();
    if (v) setVault(v);
  };

  const newNote = useCallback(async (dir, name = 'Untitled') => {
    const p = await api.createFile(dir || vaultIndex.root, name);
    await refreshTree();
    openPath(p);
    return p;
  }, [refreshTree, openPath]);

  const newFolder = async (dir) => {
    const p = await api.createFolder(dir || vaultIndex.root, 'New folder');
    await refreshTree();
    return p;
  };

  const openTarget = useCallback(async (target) => {
    const found = resolveNote(target);
    if (found) return openPath(found);
    // Create the missing note (Obsidian behaviour). Honour a folder prefix if that folder exists.
    const clean = target.split('#')[0].replace(/\.md$/i, '').trim();
    if (!clean) return;
    const parts = clean.split(/[\\/]/);
    const name = parts.pop();
    let dir = vaultIndex.root;
    if (parts.length) {
      const candidate = joinPath(vaultIndex.root, parts.join('/'));
      if (await api.stat(candidate)) dir = candidate;
    }
    await newNote(dir, name);
  }, [openPath, newNote]);

  const rename = async (item, name) => {
    try {
      const newPath = await api.rename(item.path, name);
      const cur = currentRef.current;
      if (cur) {
        const moved = replacePrefix(cur.path, item.path, newPath);
        if (moved !== cur.path) openPath(moved, { keepKey: true });
      }
      await refreshTree();
    } catch (e) { console.warn(e); }
  };

  const move = async (src, destDir) => {
    try {
      if (dirname(src) === destDir) return;
      const newPath = await api.move(src, destDir);
      const cur = currentRef.current;
      if (cur) {
        const moved = replacePrefix(cur.path, src, newPath);
        if (moved !== cur.path) openPath(moved, { keepKey: true });
      }
      await refreshTree();
    } catch (e) { alert(e.message || String(e)); }
  };

  const remove = async (item) => {
    const what = item.type === 'folder' ? `the folder “${item.name}” and everything in it` : `“${item.name}”`;
    if (!confirm(`Move ${what} to the Recycle Bin?`)) return;
    try {
      await api.remove(item.path);
      const cur = currentRef.current;
      if (cur && replacePrefix(cur.path, item.path, '\0') !== cur.path) setCurrent(null);
      await refreshTree();
    } catch (e) { alert(e.message || String(e)); }
  };

  const cycleTheme = async () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    await api.setTheme(next);
  };

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const move = (ev) => setSidebarWidth(Math.max(200, Math.min(480, startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ----- shortcuts -----
  useEffect(() => {
    const onKey = (e) => {
      if (!vault) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'p' || k === 'o') { e.preventDefault(); setSwitcher(true); }
      else if (k === 'n') { e.preventDefault(); newNote(vaultIndex.root); }
      else if (k === '\\') { e.preventDefault(); setSidebarOpen((s) => !s); }
      else if (k === 'e' && !e.shiftKey && !e.altKey) { e.preventDefault(); setMarkdownMode((m) => !m); }
      else if (k === 'v' && e.shiftKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); setSpellcheck((s) => !s); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [vault, newNote]);

  // ----- render -----
  if (vault === undefined) return <div className="boot drag" />;
  if (vault === null) return <Welcome onChoose={chooseVault} />;

  const crumbs = current ? relPath(vault.path, current.path).replace(/\.md$/i, '').split(/[\\/]/) : [];

  return (
    <div className={`app${api.platform === 'linux' ? ' platform-linux' : ''}${spellcheck ? '' : ' spellcheck-off'}`}>
      {sidebarOpen && (
        <Sidebar
          vault={vault}
          tree={tree}
          currentPath={current?.path}
          width={sidebarWidth}
          onResize={startResize}
          onOpen={(p) => openPath(p)}
          onNewNote={(dir) => newNote(dir)}
          onNewFolder={newFolder}
          onRename={rename}
          onDelete={remove}
          onMove={move}
          onReveal={(p) => api.reveal(p)}
          onChangeVault={chooseVault}
          onSearch={() => setSwitcher(true)}
          onCollapse={() => setSidebarOpen(false)}
          theme={theme}
          onTheme={cycleTheme}
        />
      )}

      <main className="main">
        <header className="topbar drag">
          {!sidebarOpen && (
            <button className="icon-btn no-drag" title="Show sidebar (Ctrl+\)" onClick={() => setSidebarOpen(true)}>
              <Icon.sidebar />
            </button>
          )}
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="crumb-sep">/</span>}
                <span className={`crumb${i === crumbs.length - 1 ? ' last' : ''}`}>{c || 'Untitled'}</span>
              </React.Fragment>
            ))}
          </div>
          {current && (
            <div className="topbar-right no-drag">
              <span
                className={`save-status ${status}`}
                title={status === 'unsaved' ? 'Press Ctrl+S to save' : undefined}
              >
                {status === 'saving'
                  ? 'Saving…'
                  : status === 'unsaved'
                  ? 'Unsaved • Ctrl+S'
                  : status === 'error'
                  ? 'Couldn’t save'
                  : 'Saved'}
              </span>
              <button
                className={`mode-toggle${spellcheck ? ' active' : ''}`}
                title={spellcheck ? 'Hide spellcheck wavy lines (Ctrl+Shift+V)' : 'Show spellcheck wavy lines (Ctrl+Shift+V)'}
                onClick={() => setSpellcheck((s) => !s)}
              >
                <Icon.spellcheck />
                <span>{spellcheck ? 'Spellcheck: On' : 'Spellcheck: Off'}</span>
              </button>
              <button
                className={`mode-toggle${markdownMode ? ' active' : ''}`}
                title={markdownMode ? 'Switch to clean view (Ctrl+E)' : 'Switch to Markdown code (Ctrl+E)'}
                onClick={() => setMarkdownMode((m) => !m)}
              >
                {markdownMode ? <Icon.code /> : <Icon.eye />}
                <span>{markdownMode ? 'Markdown' : 'Clean'}</span>
              </button>
            </div>
          )}
        </header>

        <div className="scroller">
          {current ? (
            <Editor
              key={current.key}
              path={current.path}
              markdownMode={markdownMode}
              spellcheck={spellcheck}
              onOpenTarget={openTarget}
              onOpenPath={(p) => openPath(p)}
              onRenamed={async (p) => { openPath(p, { keepKey: true }); await refreshTree(); }}
              onStatus={setStatus}
            />
          ) : (
            <div className="empty">
              <div className="empty-inner">
                <div className="empty-title">{vault.name}</div>
                <p>Pick a page from the sidebar, or start something new.</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={() => newNote(vault.path)}><Icon.compose /> New page</button>
                  <button className="btn" onClick={() => setSwitcher(true)}><Icon.search /> Search</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {switcher && (
        <QuickSwitcher
          recent={recent}
          onOpen={(p) => openPath(p)}
          onCreate={(name) => newNote(vault.path, name)}
          onClose={() => setSwitcher(false)}
        />
      )}
    </div>
  );
}

function Welcome({ onChoose }) {
  return (
    <div className="welcome drag">
      <div className="welcome-card no-drag">
        <div className="welcome-logo">
          <svg viewBox="0 0 48 48" width="56" height="56"><rect x="6" y="4" width="36" height="40" rx="8" fill="currentColor" opacity=".08" /><rect x="6" y="4" width="36" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M15 16h18M15 24h18M15 32h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
        </div>
        <h1>Local Notes</h1>
        <p>Your notes are plain markdown files in a folder on your computer.<br />Choose any folder to use as your vault, including an existing Obsidian vault.</p>
        <button className="btn primary lg" onClick={onChoose}>Choose a vault folder</button>
      </div>
    </div>
  );
}
