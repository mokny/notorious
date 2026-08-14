import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { MENTION_PATTERN } from "@notorious/shared";
import { flattenDocText } from "./templateSyntax.js";

const mentionHighlightKey = new PluginKey("mentionHighlight");

/**
 * Purely visual: finds already-saved `@[Name](user:id)` mention syntax in the
 * live ProseMirror doc and decorates each match with the `mention-pill` class
 * (see globals.css) - same re-scan-from-scratch-on-every-doc-change approach
 * as TemplateHighlight.ts/SearchHighlight.ts (these fields are short enough
 * that re-scanning beats incremental decoration mapping). This is the block-
 * editor equivalent of MentionText.tsx, which does the same job for plain-
 * string surfaces (comments, text properties) that never go through
 * ProseMirror at all.
 */
function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const { text, toDocPos } = flattenDocText(doc);
  if (!text.includes("@[")) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    decorations.push(Decoration.inline(toDocPos(start), toDocPos(end), { class: "mention-pill" }));
  }
  return DecorationSet.create(doc, decorations);
}

export const MentionHighlight = Extension.create({
  name: "mentionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: mentionHighlightKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
