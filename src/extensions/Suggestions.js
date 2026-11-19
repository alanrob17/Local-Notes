import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { SuggestionList } from '../components/SuggestionList';
import { vaultIndex } from '../lib/vault';

// Generic React renderer for suggestion popups, positioned under the caret.
function makeRender() {
  return () => {
    let component;
    let el;
    const place = (rect) => {
      if (!rect || !el) return;
      const r = rect();
      if (!r) return;
      const h = el.offsetHeight || 300;
      const below = r.bottom + 6 + h < window.innerHeight;
      el.style.left = `${Math.min(r.left, window.innerWidth - 340)}px`;
      el.style.top = below ? `${r.bottom + 6}px` : `${Math.max(8, r.top - h - 6)}px`;
    };
    return {
      onStart: (props) => {
        component = new ReactRenderer(SuggestionList, { props, editor: props.editor });
        el = document.createElement('div');
        el.className = 'suggest-popup';
        el.appendChild(component.element);
        document.body.appendChild(el);
        requestAnimationFrame(() => place(props.clientRect));
      },
      onUpdate: (props) => {
        component.updateProps(props);
        requestAnimationFrame(() => place(props.clientRect));
      },
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          el?.remove();
          return true;
        }
        return component.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        el?.remove();
        component?.destroy();
      },
    };
  };
}

const I = (d) => d; // icon passthrough for readability

export const SLASH_ITEMS = [
  { title: 'Text', desc: 'Just start writing with plain text.', icon: I('Aa'), keys: 'paragraph p',
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Heading 1', desc: 'Big section heading.', icon: I('H1'), keys: 'h1 title',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 1 }).run() },
  { title: 'Heading 2', desc: 'Medium section heading.', icon: I('H2'), keys: 'h2 subtitle',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run() },
  { title: 'Heading 3', desc: 'Small section heading.', icon: I('H3'), keys: 'h3',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run() },
  { title: 'Bulleted list', desc: 'Create a simple bulleted list.', icon: I('•'), keys: 'ul bullet unordered',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Numbered list', desc: 'Create a list with numbering.', icon: I('1.'), keys: 'ol ordered number',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'To-do list', desc: 'Track tasks with a to-do list.', icon: I('☑'), keys: 'todo task checkbox check',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Quote', desc: 'Capture a quote.', icon: I('❝'), keys: 'blockquote',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Callout', desc: 'Make writing stand out.', icon: I('💡'), keys: 'callout note info',
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '[!note] ' }] }],
    }).run() },
  { title: 'Code', desc: 'Capture a code snippet.', icon: I('</>'), keys: 'codeblock pre',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'Divider', desc: 'Visually divide blocks.', icon: I('—'), keys: 'hr rule separator line',
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { title: 'Table', desc: 'Add a simple table.', icon: I('▦'), keys: 'grid',
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Link to page', desc: 'Link to another note in your vault.', icon: I('↗'), keys: 'wikilink page mention',
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent('[[').run() },
];

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === 'codeBlock') return false;
          // only trigger at start of a block or after whitespace
          const before = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0');
          return before === '' || /\s$/.test(before);
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keys.includes(q)).slice(0, 20);
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: makeRender(),
      }),
    ];
  },
});

export const PageSuggest = Extension.create({
  name: 'pageSuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('pageSuggest'),
        char: '[[',
        allowSpaces: true,
        startOfLine: false,
        allowedPrefixes: null,
        items: ({ query }) => {
          const q = query.replace(/\]+$/, '').toLowerCase().trim();
          const notes = vaultIndex.notes
            .filter((n) => n.path !== vaultIndex.currentNotePath)
            .map((n) => ({ ...n, idx: n.name.toLowerCase().indexOf(q) }))
            .filter((n) => !q || n.idx >= 0 || n.rel.toLowerCase().includes(q))
            .sort((a, b) => (a.idx < 0) - (b.idx < 0) || a.idx - b.idx || a.name.length - b.name.length)
            .slice(0, 8)
            .map((n) => ({ title: n.name, desc: n.rel.replace(/\.md$/i, ''), icon: '📄', target: n.name }));
          const raw = query.replace(/\]+$/, '').trim();
          if (raw && !notes.some((n) => n.title.toLowerCase() === raw.toLowerCase())) {
            notes.push({ title: `Link to new page “${raw}”`, desc: 'Click the link later to create it', icon: '+', target: raw });
          }
          return notes;
        },
        command: ({ editor, range, props }) => {
          // swallow auto-closed "]]" if present
          const after = editor.state.doc.textBetween(range.to, Math.min(range.to + 2, editor.state.doc.content.size), '');
          const to = after === ']]' ? range.to + 2 : range.to;
          editor
            .chain()
            .focus()
            .deleteRange({ from: range.from, to })
            .insertContent([{ type: 'wikiLink', attrs: { target: props.target, alias: '', embed: false } }, { type: 'text', text: ' ' }])
            .run();
        },
        render: makeRender(),
      }),
    ];
  },
});
