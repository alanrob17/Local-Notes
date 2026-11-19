import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import ContextMenu from './ContextMenu';

export default function Sidebar({
  vault, tree, currentPath, width, onResize,
  onOpen, onNewNote, onNewFolder, onRename, onDelete, onMove, onReveal,
  onChangeVault, onSearch, onCollapse, theme, onTheme,
}) {
  const storageKey = `expanded:${vault.path}`;
  const [expanded, setExpanded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { return new Set(); }
  });
  const [renaming, setRenaming] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...expanded]));
  }, [expanded, storageKey]);

  // Reveal the current note's folder chain.
  useEffect(() => {
    if (!currentPath) return;
    const parts = [];
    let p = currentPath;
    while (true) {
      const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
      if (i <= vault.path.length) break;
      p = p.slice(0, i);
      parts.push(p);
    }
    if (parts.some((x) => !expanded.has(x))) setExpanded((s) => new Set([...s, ...parts]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const toggle = (p) => setExpanded((s) => {
    const n = new Set(s);
    n.has(p) ? n.delete(p) : n.add(p);
    return n;
  });

  const startNew = async (dir, kind) => {
    if (dir) setExpanded((s) => new Set([...s, dir]));
    if (kind === 'folder') {
      const p = await onNewFolder(dir);
      if (p) setRenaming(p);
    } else onNewNote(dir);
  };

  const openMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const isFolder = item?.type === 'folder';
    const dir = item ? (isFolder ? item.path : null) : vault.path;
    const items = [];
    if (!item || isFolder) {
      items.push({ label: 'New page', icon: <Icon.page />, onClick: () => startNew(dir || vault.path, 'note') });
      items.push({ label: 'New folder', icon: <Icon.newFolder />, onClick: () => startNew(dir || vault.path, 'folder') });
    }
    if (item) {
      if (items.length) items.push('separator');
      items.push({ label: 'Rename', icon: <Icon.edit />, onClick: () => setRenaming(item.path) });
      items.push({ label: 'Show in Explorer', icon: <Icon.reveal />, onClick: () => onReveal(item.path) });
      items.push('separator');
      items.push({ label: 'Delete', icon: <Icon.trash />, danger: true, onClick: () => onDelete(item) });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onDropTo = async (e, destDir) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const src = e.dataTransfer.getData('text/x-localnotes-path');
    if (src && destDir !== undefined) await onMove(src, destDir);
  };

  const renderItems = (items, depth) =>
    items.filter((it) => it.type !== 'attachment').map((it) => {
      const isFolder = it.type === 'folder';
      const open = expanded.has(it.path);
      const active = it.path === currentPath;
      return (
        <div key={it.path}>
          <div
            className={`tree-row${active ? ' active' : ''}${dropTarget === it.path ? ' drop' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable={renaming !== it.path}
            onDragStart={(e) => { e.dataTransfer.setData('text/x-localnotes-path', it.path); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (isFolder) { e.preventDefault(); setDropTarget(it.path); } }}
            onDragLeave={() => setDropTarget((d) => (d === it.path ? null : d))}
            onDrop={(e) => isFolder && onDropTo(e, it.path)}
            onClick={() => (isFolder ? toggle(it.path) : onOpen(it.path))}
            onContextMenu={(e) => openMenu(e, it)}
            title={it.name}
          >
            <span
              className={`tree-chevron${isFolder ? '' : ' invisible'}${open ? ' open' : ''}`}
              onClick={(e) => { e.stopPropagation(); if (isFolder) toggle(it.path); }}
            >
              <Icon.chevron />
            </span>
            <span className="tree-icon">{isFolder ? (open ? <Icon.folderOpen /> : <Icon.folder />) : <Icon.page />}</span>
            {renaming === it.path ? (
              <RenameInput
                initial={it.name}
                onDone={async (name) => {
                  setRenaming(null);
                  if (name && name !== it.name) await onRename(it, name);
                }}
              />
            ) : (
              <span className="tree-label">{it.name}</span>
            )}
            <span className="tree-actions">
              <button className="icon-btn sm" title="More" onClick={(e) => openMenu(e, it)}><Icon.dots /></button>
              {isFolder && (
                <button className="icon-btn sm" title="New page inside" onClick={(e) => { e.stopPropagation(); startNew(it.path, 'note'); }}>
                  <Icon.plus />
                </button>
              )}
            </span>
          </div>
          {isFolder && open && (
            <div>
              {it.children.filter((c) => c.type !== 'attachment').length === 0 ? (
                <div className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>No pages inside</div>
              ) : (
                renderItems(it.children, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    });

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-top drag">
        <button className="vault-switch no-drag" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({
            x: r.left, y: r.bottom + 4,
            items: [
              { label: 'Open another vault…', icon: <Icon.vault />, onClick: onChangeVault },
              { label: 'Show vault in Explorer', icon: <Icon.reveal />, onClick: () => onReveal(vault.path) },
              'separator',
              { label: `Theme: ${theme[0].toUpperCase() + theme.slice(1)}`, icon: <Icon.sun />, onClick: onTheme },
            ],
          });
        }}>
          <span className="vault-avatar">{vault.name.slice(0, 1).toUpperCase()}</span>
          <span className="vault-name">{vault.name}</span>
          <span className="vault-caret">⌄</span>
        </button>
        <button className="icon-btn no-drag" title="Collapse sidebar (Ctrl+\)" onClick={onCollapse}><Icon.sidebar /></button>
      </div>

      <div className="sidebar-actions">
        <button className="side-action" onClick={onSearch}>
          <Icon.search /><span>Search</span><kbd>Ctrl P</kbd>
        </button>
        <button className="side-action" onClick={() => startNew(vault.path, 'note')}>
          <Icon.compose /><span>New page</span><kbd>Ctrl N</kbd>
        </button>
      </div>

      <div className="sidebar-section">
        <span>Pages</span>
        <span className="section-actions">
          <button className="icon-btn sm" title="New folder" onClick={() => startNew(vault.path, 'folder')}><Icon.newFolder /></button>
          <button className="icon-btn sm" title="New page" onClick={() => startNew(vault.path, 'note')}><Icon.plus /></button>
        </span>
      </div>

      <div
        className={`tree${dropTarget === vault.path ? ' drop' : ''}`}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={(e) => { e.preventDefault(); setDropTarget(vault.path); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropTarget(null); }}
        onDrop={(e) => onDropTo(e, vault.path)}
      >
        {tree.length === 0 ? (
          <div className="tree-empty" style={{ paddingLeft: 16 }}>This vault is empty. Create your first page.</div>
        ) : (
          renderItems(tree, 0)
        )}
      </div>

      <div className="sidebar-resizer" onMouseDown={onResize} />
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function RenameInput({ initial, onDone }) {
  const [v, setV] = useState(initial);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (val) => { if (done.current) return; done.current = true; onDone(val); };
  return (
    <input
      ref={ref}
      className="tree-rename"
      value={v}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v.trim());
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
