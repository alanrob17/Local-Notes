import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Style Obsidian callouts (> [!note] ...) as Notion-like callout boxes, without changing the markdown.
const CALLOUT_ICONS = {
  note: '📝', info: 'ℹ️', tip: '💡', hint: '💡', important: '❗', warning: '⚠️', caution: '⚠️',
  danger: '🔥', error: '⛔', bug: '🐞', success: '✅', check: '✅', done: '✅', question: '❓',
  help: '❓', faq: '❓', example: '📌', quote: '💬', abstract: '📋', summary: '📋', tldr: '📋', todo: '☑️',
};

export const Callouts = Extension.create({
  name: 'callouts',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('callouts'),
        props: {
          decorations(state) {
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'blockquote') return true;
              const first = node.firstChild;
              const m = first && first.textContent.match(/^\[!([A-Za-z]+)\][+-]?/);
              if (m) {
                const type = m[1].toLowerCase();
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: `callout callout-${type}`,
                    'data-icon': CALLOUT_ICONS[type] || '💡',
                  }),
                );
                // fade the [!type] marker
                const start = pos + 2; // blockquote open + paragraph open
                decos.push(Decoration.inline(start, start + m[0].length, { class: 'callout-marker' }));
              }
              return true;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
