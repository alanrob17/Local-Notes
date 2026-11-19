import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { vaultIndex, resolveAttachment, resolveNote, vaultUrl, IMAGE_EXT } from '../lib/vault';

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// markdown-it inline rule for [[target|alias]] and ![[embed]]
function wikilinkPlugin(md) {
  if (md.__wikilink) return;
  md.__wikilink = true;
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    let p = state.pos;
    let embed = false;
    if (src.charCodeAt(p) === 0x21 /* ! */) { embed = true; p++; }
    if (src.charCodeAt(p) !== 0x5b || src.charCodeAt(p + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', p + 2);
    if (end < 0) return false;
    const inner = src.slice(p + 2, end);
    if (!inner.trim() || /[\n\[\]]/.test(inner)) return false;
    if (!silent) {
      const bar = inner.indexOf('|');
      const token = state.push('wikilink', '', 0);
      token.meta = {
        target: (bar >= 0 ? inner.slice(0, bar) : inner).replace(/\\$/, '').trim(),
        alias: bar >= 0 ? inner.slice(bar + 1).trim() : '',
        embed,
      };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, alias, embed } = tokens[idx].meta;
    return `<span data-wikilink="" data-target="${escAttr(target)}" data-alias="${escAttr(alias)}" data-embed="${embed ? '1' : ''}"></span>`;
  };
}

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: { default: '', parseHTML: (el) => el.getAttribute('data-target') || '' },
      alias: { default: '', parseHTML: (el) => el.getAttribute('data-alias') || '' },
      embed: { default: false, parseHTML: (el) => el.getAttribute('data-embed') === '1' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { target, alias, embed } = node.attrs;
    const attrs = mergeAttributes(HTMLAttributes, {
      'data-wikilink': '',
      'data-target': target,
      'data-alias': alias,
      'data-embed': embed ? '1' : '',
    });
    if (embed && IMAGE_EXT.test(target.split('|')[0])) {
      const abs = resolveAttachment(target);
      const width = /^\d+$/.test(alias) ? alias : null;
      return ['span', { ...attrs, class: 'wl-embed-image' },
        abs
          ? ['img', { src: vaultUrl(abs), alt: target, draggable: 'false', ...(width ? { style: `width:${width}px` } : {}) }]
          : ['span', { class: 'wl-missing' }, `Missing image: ${target}`]];
    }
    const label = alias || target.replace(/\.md$/i, '').replace(/#/, ' › ');
    const exists = !!resolveNote(target);
    return ['span', { ...attrs, class: `wikilink${exists ? '' : ' wikilink-new'}${embed ? ' wikilink-embed' : ''}` }, label];
  },

  renderText({ node }) {
    return node.attrs.alias || node.attrs.target;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(!?)\[\[([^\[\]\n]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const inner = match[2];
          const bar = inner.indexOf('|');
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({
              target: (bar >= 0 ? inner.slice(0, bar) : inner).trim(),
              alias: bar >= 0 ? inner.slice(bar + 1).trim() : '',
              embed: match[1] === '!',
            }),
          );
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const { target, alias, embed } = node.attrs;
          let inner = target + (alias ? `|${alias}` : '');
          if (state.inTable) inner = inner.replace(/\|/g, '\\|');
          state.write(`${embed ? '!' : ''}[[${inner}]]`);
        },
        parse: {
          setup(markdownit) {
            markdownit.use(wikilinkPlugin);
          },
        },
      },
    };
  },
});

export { vaultIndex };
