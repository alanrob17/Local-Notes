import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Image from '@tiptap/extension-image';
import { resolveRelative, vaultUrl } from '../lib/vault';

// Write text exactly as typed (no HTML entity escaping), relying on our minimal markdown escaper.
export const PlainText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.text(node.text);
        },
        parse: {},
      },
    };
  },
});

// Obsidian treats a single newline as a line break, so write line breaks as plain newlines.
export const SoftHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write(state.inTable ? '<br>' : '\n');
              return;
            }
          }
        },
        parse: {},
      },
    };
  },
});

// Standard markdown images with paths relative to the note, served via the vault:// protocol.
export const VaultImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src || '';
    const resolved = resolveRelative(src);
    const display = resolved && !/^(https?:|data:|vault:)/i.test(resolved) ? vaultUrl(resolved) : resolved;
    return ['img', { ...HTMLAttributes, src: display, 'data-src': src }];
  },
});
