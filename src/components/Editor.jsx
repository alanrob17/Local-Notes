import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from '../extensions/WikiLink';
import { PlainText, SoftHardBreak, VaultImage } from '../extensions/Overrides';
import { SlashCommand, PageSuggest } from '../extensions/Suggestions';
import { Callouts } from '../extensions/Callouts';
import { splitFrontmatter, parseProperties } from '../lib/frontmatter';
import { patchMarkdownEscaping } from '../lib/markdownEscape';
import { vaultIndex, basename, dirname, resolveRelative, IMAGE_EXT } from '../lib/vault';

patchMarkdownEscaping();

const api = window.api;
const SAVE_DELAY = 600;

function noteName(p) {
  return basename(p).replace(/\.md$/i, '');
}

export default function Editor({ path, markdownMode, onOpenTarget, onOpenPath, onRenamed, onStatus }) {
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setInitial(null);
    setError(null);
    api.readFile(path).then(
      (text) => alive && setInitial(text),
      (e) => alive && setError(String(e.message || e)),
    );
    return () => { alive = false; };
    // Only load on first mount: renames keep the same editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="editor-empty">Couldn’t open this note: {error}</div>;
  if (initial === null) return <div className="editor-loading" />;
  return (
    <NoteEditor
      path={path}
      initialText={initial}
      markdownMode={markdownMode}
      onOpenTarget={onOpenTarget}
      onOpenPath={onOpenPath}
      onRenamed={onRenamed}
      onStatus={onStatus}
    />
  );
}

function NoteEditor({ path, initialText, markdownMode, onOpenTarget, onOpenPath, onRenamed, onStatus }) {
  const pathRef = useRef(path);
  pathRef.current = path;
  vaultIndex.currentNotePath = path;

  const initialSplit = useRef(splitFrontmatter(initialText)).current;
  const fmRef = useRef(initialSplit.frontmatter);
  const lastSavedRef = useRef(initialText);
  const crlfRef = useRef(/\r\n/.test(initialText));
  const timerRef = useRef(null);
  const modeRef = useRef(markdownMode);
  const prevModeRef = useRef(markdownMode);
  const rawDirtyRef = useRef(false);
  const rawSavedSinceCleanRef = useRef(false);
  const renamingRef = useRef(false);
  const [title, setTitle] = useState(noteName(path));
  const [props, setProps] = useState(parseProperties(initialSplit.frontmatter));
  const [rawText, setRawText] = useState(() => initialText.replace(/\r\n/g, '\n'));
  const rawRef = useRef(rawText);
  rawRef.current = rawText;
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const titleRef = useRef(null);
  const editorRef = useRef(null);
  const rawInputRef = useRef(null);

  useEffect(() => setTitle(noteName(path)), [path]);
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [title]);

  const resizeRaw = useCallback(() => {
    const el = rawInputRef.current;
    if (!el) return;
    const scroller = el.closest('.scroller');
    const scrollTop = scroller ? scroller.scrollTop : 0;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
    if (scroller) scroller.scrollTop = scrollTop;
  }, []);

  useEffect(() => {
    if (markdownMode) resizeRaw();
  }, [rawText, markdownMode, resizeRaw]);

  const serialize = useCallback(() => {
    if (modeRef.current) {
      let full = rawRef.current;
      if (crlfRef.current) full = full.replace(/\r?\n/g, '\r\n');
      return full;
    }
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return null;
    let md = ed.storage.markdown.getMarkdown();
    if (md && !md.endsWith('\n')) md += '\n';
    let full = fmRef.current + md;
    if (crlfRef.current) full = full.replace(/\r?\n/g, '\r\n');
    return full;
  }, []);

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const full = serialize();
    if (full === null || full === lastSavedRef.current) { onStatus?.('saved'); return; }
    lastSavedRef.current = full;
    if (modeRef.current) {
      rawDirtyRef.current = false;
      rawSavedSinceCleanRef.current = true;
    }
    try {
      await api.writeFile(pathRef.current, full);
      onStatus?.('saved');
    } catch (e) {
      onStatus?.('error');
      console.error(e);
    }
  }, [serialize, onStatus]);

  const scheduleSave = useCallback(() => {
    onStatus?.('saving');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DELAY);
  }, [save, onStatus]);

  const insertImageFiles = useCallback(async (files, view, pos) => {
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.' + (file.type.split('/')[1] || 'png')])[0];
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const name = file.name && file.name !== 'image.png' ? file.name : `Pasted image ${stamp}${ext}`;
      const saved = await api.saveAttachment(name, new Uint8Array(buf));
      vaultIndex.attachments.push({ name: saved.name, path: saved.path });
      const node = view.state.schema.nodes.wikiLink.create({ target: saved.name, alias: '', embed: true });
      const tr = pos != null ? view.state.tr.insert(pos, node) : view.state.tr.replaceSelectionWith(node);
      view.dispatch(tr);
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ text: false, hardBreak: false, heading: { levels: [1, 2, 3, 4, 5, 6] }, codeBlock: { HTMLAttributes: { spellcheck: 'false' } } }),
      PlainText,
      SoftHardBreak,
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ node, editor: ed }) => {
          if (node.type.name === 'heading') return `Heading ${node.attrs.level}`;
          if (ed.state.doc.childCount === 1 && ed.state.doc.firstChild === node) return 'Write something, or press ‘/’ for commands…';
          return 'Press ‘/’ for commands';
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      VaultImage.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      WikiLink,
      Callouts,
      SlashCommand,
      PageSuggest,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialSplit.body,
    autofocus: initialText.trim() === '' ? false : false,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      handleClick(view, pos, event) {
        const wl = event.target.closest?.('[data-wikilink]');
        if (wl) {
          const target = wl.getAttribute('data-target');
          if (wl.getAttribute('data-embed') === '1' && IMAGE_EXT.test(target)) return false;
          onOpenTarget(target);
          return true;
        }
        const a = event.target.closest?.('a[href]');
        if (a) {
          const href = a.getAttribute('href');
          if (/^(https?:|mailto:)/i.test(href)) api.openExternal(href);
          else if (href.startsWith('#')) return false;
          else {
            const resolved = resolveRelative(href.split('#')[0]);
            if (/\.md$/i.test(resolved)) onOpenPath(resolved);
            else onOpenTarget(href);
          }
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        insertImageFiles(files, view, null);
        return true;
      },
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImageFiles(files, view, pos ?? null);
        return true;
      },
      handleKeyDown(view, event) {
        // ArrowUp / Backspace at the very start jumps back to the title
        const { from, empty } = view.state.selection;
        if (empty && from <= 1 && (event.key === 'ArrowUp')) {
          titleRef.current?.focus();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => { if (!modeRef.current) scheduleSave(); },
  });
  editorRef.current = editor;
  window.__lnEditor = editor;

  const insertImageToRaw = useCallback(async (files) => {
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.' + (file.type.split('/')[1] || 'png')])[0];
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const name = file.name && file.name !== 'image.png' ? file.name : `Pasted image ${stamp}${ext}`;
      const saved = await api.saveAttachment(name, new Uint8Array(buf));
      vaultIndex.attachments.push({ name: saved.name, path: saved.path });
      const embed = `![[${saved.name}]]`;
      const el = rawInputRef.current;
      const start = el ? el.selectionStart : rawRef.current.length;
      const end = el ? el.selectionEnd : rawRef.current.length;
      const next = rawRef.current.slice(0, start) + embed + rawRef.current.slice(end);
      rawRef.current = next;
      rawDirtyRef.current = true;
      setRawText(next);
      onStatus?.('unsaved');
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(start + embed.length, start + embed.length);
        }
      });
    }
  }, [onStatus]);

  // Sync content when switching between Clean (WYSIWYG) and Markdown code mode.
  useEffect(() => {
    if (prevModeRef.current === markdownMode) return;
    prevModeRef.current = markdownMode;
    const ed = editorRef.current;
    if (markdownMode) {
      // Clean -> Markdown: only serialize from Tiptap if there are unsaved WYSIWYG edits;
      // otherwise show the exact file text from disk without re-serializing.
      if (timerRef.current && ed && !ed.isDestroyed) {
        save();
        let md = ed.storage.markdown.getMarkdown();
        if (md && !md.endsWith('\n')) md += '\n';
        const full = (fmRef.current + md).replace(/\r\n/g, '\n');
        rawRef.current = full;
        setRawText(full);
      } else {
        const clean = lastSavedRef.current.replace(/\r\n/g, '\n');
        rawRef.current = clean;
        setRawText(clean);
      }
      rawDirtyRef.current = false;
      rawSavedSinceCleanRef.current = false;
      modeRef.current = true;
      requestAnimationFrame(() => {
        resizeRaw();
        rawInputRef.current?.focus();
      });
    } else {
      // Markdown -> Clean: save any pending Markdown changes and re-parse into Tiptap if edited.
      const needsSync = rawDirtyRef.current || rawSavedSinceCleanRef.current;
      if (rawDirtyRef.current) save();
      modeRef.current = false;
      if (needsSync) {
        const { frontmatter, body } = splitFrontmatter(rawRef.current);
        fmRef.current = frontmatter;
        setProps(parseProperties(frontmatter));
        if (ed && !ed.isDestroyed) ed.commands.setContent(body, false);
        rawDirtyRef.current = false;
        rawSavedSinceCleanRef.current = false;
      }
      requestAnimationFrame(() => ed?.commands.focus());
    }
  }, [markdownMode, resizeRaw, save]);

  // Flush pending saves when leaving the note or closing the window.
  useEffect(() => {
    const flush = () => { if (timerRef.current || (modeRef.current && rawDirtyRef.current)) save(); };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [save]);

  // Reload if the file changes on disk (e.g. edited in Obsidian) and we have no pending edits.
  useEffect(() => {
    return api.onVaultChanged(async (changed) => {
      if (changed && changed.toLowerCase() !== pathRef.current.toLowerCase()) return;
      if (timerRef.current || (modeRef.current && rawDirtyRef.current)) return;
      let text;
      try { text = await api.readFile(pathRef.current); } catch { return; }
      if (text === lastSavedRef.current || timerRef.current || (modeRef.current && rawDirtyRef.current)) return;
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const { frontmatter, body } = splitFrontmatter(text);
      lastSavedRef.current = text;
      fmRef.current = frontmatter;
      crlfRef.current = /\r\n/.test(text);
      const clean = text.replace(/\r\n/g, '\n');
      rawRef.current = clean;
      setRawText(clean);
      setProps(parseProperties(frontmatter));
      const { from, to } = ed.state.selection;
      ed.commands.setContent(body, false);
      const max = ed.state.doc.content.size;
      try { ed.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) }); } catch {}
    });
  }, []);

  // Ctrl+S flushes immediately
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  useEffect(() => {
    if (editor && initialText.trim() === '') titleRef.current?.select();
  }, [editor, initialText]);

  const commitTitle = async () => {
    if (renamingRef.current) return;
    const clean = title.replace(/[\\/:*?"<>|]/g, '').replace(/\.md$/i, '').trim();
    const current = noteName(pathRef.current);
    if (!clean) { setTitle(current); return; }
    if (clean === current) return;
    renamingRef.current = true;
    try {
      if (timerRef.current || (modeRef.current && rawDirtyRef.current)) await save();
      const newPath = await api.rename(pathRef.current, clean);
      pathRef.current = newPath;
      onRenamed(newPath);
    } catch (e) {
      setTitle(noteName(pathRef.current));
    } finally {
      renamingRef.current = false;
    }
  };

  const openLinkEditor = () => {
    setLinkValue(editor.getAttributes('link').href || '');
    setLinkMode(true);
  };
  const applyLink = () => {
    const v = linkValue.trim();
    if (!v) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(v) || v.startsWith('#') || v.includes('.md') ? v : `https://${v}` }).run();
    setLinkMode(false);
  };

  const blockType = !editor ? 'Text'
    : editor.isActive('heading', { level: 1 }) ? 'Heading 1'
    : editor.isActive('heading', { level: 2 }) ? 'Heading 2'
    : editor.isActive('heading', { level: 3 }) ? 'Heading 3'
    : editor.isActive('taskList') ? 'To-do'
    : editor.isActive('bulletList') ? 'Bulleted'
    : editor.isActive('orderedList') ? 'Numbered'
    : editor.isActive('blockquote') ? 'Quote'
    : 'Text';

  return (
    <div className="page">
      <textarea
        ref={titleRef}
        className="page-title"
        rows={1}
        value={title}
        placeholder="Untitled"
        spellCheck={false}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            commitTitle();
            if (markdownMode) {
              rawInputRef.current?.focus();
              rawInputRef.current?.setSelectionRange(0, 0);
            } else {
              editor?.commands.focus('start');
            }
          }
          if (e.key === 'Escape') { setTitle(noteName(pathRef.current)); e.currentTarget.blur(); }
        }}
        onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
      />

      {markdownMode ? (
        <textarea
          ref={rawInputRef}
          className="markdown-source"
          value={rawText}
          placeholder="Write Markdown…"
          spellCheck={true}
          onChange={(e) => {
            const val = e.target.value;
            rawRef.current = val;
            rawDirtyRef.current = true;
            setRawText(val);
            onStatus?.('unsaved');
          }}
          onPaste={(e) => {
            const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (files.length) {
              e.preventDefault();
              insertImageToRaw(files);
            }
          }}
          onDrop={(e) => {
            const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (files.length) {
              e.preventDefault();
              insertImageToRaw(files);
            }
          }}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = rawText.slice(0, start) + '  ' + rawText.slice(end);
              rawRef.current = next;
              rawDirtyRef.current = true;
              setRawText(next);
              onStatus?.('unsaved');
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
            } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
              e.preventDefault();
              titleRef.current?.focus();
            }
          }}
        />
      ) : (
        props.length > 0 && (
          <div className="properties">
            {props.map((p) => (
              <div className="property" key={p.key}>
                <span className="property-key">{p.key}</span>
                <span className="property-value">
                  {Array.isArray(p.value)
                    ? p.value.map((v) => <span className="tag" key={v}>{v}</span>)
                    : p.value || <span className="muted">Empty</span>}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      <div className="clean-editor-wrap" hidden={markdownMode}>
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="formatMenu"
            tippyOptions={{ duration: 120, placement: 'top-start', onHidden: () => setLinkMode(false), maxWidth: 'none' }}
            shouldShow={({ editor: ed, state, from, to }) => {
              if (modeRef.current) return false;
              if (from === to || ed.isActive('codeBlock') || ed.isActive('image')) return false;
              if (state.selection.node) return false;
              return !!state.doc.textBetween(from, to).trim();
            }}
          >
            {linkMode ? (
              <div className="bubble">
                <input
                  className="bubble-input"
                  autoFocus
                  placeholder="Paste a link…"
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                    if (e.key === 'Escape') { setLinkMode(false); editor.commands.focus(); }
                  }}
                />
                <button className="bubble-btn" onMouseDown={(e) => { e.preventDefault(); applyLink(); }}>Apply</button>
              </div>
            ) : (
              <div className="bubble">
                <select
                  className="bubble-select"
                  value={blockType}
                  onChange={(e) => {
                    const c = editor.chain().focus();
                    const v = e.target.value;
                    if (v === 'Text') c.setParagraph().run();
                    else if (v.startsWith('Heading')) c.setNode('heading', { level: Number(v.slice(-1)) }).run();
                    else if (v === 'To-do') c.toggleTaskList().run();
                    else if (v === 'Bulleted') c.toggleBulletList().run();
                    else if (v === 'Numbered') c.toggleOrderedList().run();
                    else if (v === 'Quote') c.toggleBlockquote().run();
                  }}
                >
                  {['Text', 'Heading 1', 'Heading 2', 'Heading 3', 'Bulleted', 'Numbered', 'To-do', 'Quote'].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <span className="bubble-sep" />
                <BubbleBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><b>B</b></BubbleBtn>
                <BubbleBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><i>i</i></BubbleBtn>
                <BubbleBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></BubbleBtn>
                <BubbleBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><span className="mono">&lt;/&gt;</span></BubbleBtn>
                <BubbleBtn active={editor.isActive('link')} onClick={openLinkEditor} title="Link (Ctrl+K)">Link</BubbleBtn>
              </div>
            )}
          </BubbleMenu>
        )}

        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="tableMenu"
            tippyOptions={{ duration: 120, placement: 'top', maxWidth: 'none' }}
            shouldShow={({ editor: ed, from, to }) => !modeRef.current && ed.isActive('table') && from === to}
          >
            <div className="bubble">
              <BubbleBtn onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</BubbleBtn>
              <BubbleBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</BubbleBtn>
              <span className="bubble-sep" />
              <BubbleBtn onClick={() => editor.chain().focus().deleteRow().run()}>− Row</BubbleBtn>
              <BubbleBtn onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</BubbleBtn>
              <span className="bubble-sep" />
              <BubbleBtn onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</BubbleBtn>
            </div>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} className="editor" />
      </div>

      <div
        className="editor-tail"
        onMouseDown={(e) => {
          e.preventDefault();
          if (markdownMode) {
            const el = rawInputRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
            return;
          }
          if (!editor) return;
          const last = editor.state.doc.lastChild;
          if (last && (last.type.name !== 'paragraph' || last.content.size > 0)) {
            editor.chain().insertContentAt(editor.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
          } else editor.commands.focus('end');
        }}
      />
    </div>
  );
}

function BubbleBtn({ active, onClick, title, children }) {
  return (
    <button
      className={`bubble-btn${active ? ' active' : ''}`}
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {children}
    </button>
  );
}

export { dirname };
