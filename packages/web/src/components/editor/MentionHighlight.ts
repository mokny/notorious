import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { MENTION_PATTERN } from "@notorious/shared";
import { flattenDocText } from "./templateSyntax.js";

const mentionHighlightKey = new PluginKey("mentionHighlight");

/**
 * Purely visual: finds already-saved `@[Name|id]` mention syntax in the live
 * ProseMirror doc and, for each match, (1) hides the raw syntax text itself
 * via the `mention-source` class (`display: none` - see globals.css) and (2)
 * draws a `mention-pill`-styled widget showing just `@Name` in its place.
 * Decorations can only style existing content, not replace it, so a plain
 * `Decoration.inline` class on the raw text (an earlier version of this file)
 * left the literal `@[Name|id]` characters visible, just tinted - this
 * two-decoration hide+widget combo is the standard ProseMirror technique for
 * a "rendered" view over raw source text without a custom atomic node (same
 * problem/solution shape as e.g. hiding `**`/`#` markdown delimiters outside
 * the cursor's own token in other live-markdown editors). Same re-scan-from-
 * scratch-on-every-doc-change approach as TemplateHighlight.ts/
 * SearchHighlight.ts (these fields are short enough that re-scanning beats
 * incremental decoration mapping). This is the block-editor equivalent of
 * MentionText.tsx, which does the same job for plain-string surfaces
 * (comments, text properties) that never go through ProseMirror at all.
 */
function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const { text, toDocPos } = flattenDocText(doc);
  if (!text.includes("@[")) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const name = match[1]!;
    decorations.push(Decoration.inline(toDocPos(start), toDocPos(end), { class: "mention-source" }));
    decorations.push(
      Decoration.widget(toDocPos(start), () => {
        const pill = document.createElement("span");
        pill.className = "mention-pill";
        pill.textContent = `@${name}`;
        return pill;
      }),
    );
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
