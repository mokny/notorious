import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { flattenDocText } from "./templateSyntax.js";

export const searchHighlightKey = new PluginKey("searchHighlight");

interface MutableRef<T> {
  current: T;
}

export interface SearchHighlightOptions {
  /** Lowercased search words - mutated in place by useMarkdownEditor.ts (a plain ref, not a reactive option) so updating it doesn't require recreating this extension. */
  termsRef: MutableRef<string[]>;
  /** Whether *this* editor instance is the search toolbar's currently active block - see useMarkdownEditor.ts. */
  isActiveRef: MutableRef<boolean>;
}

function buildDecorations(doc: ProseMirrorNode, terms: string[], isActive: boolean): DecorationSet {
  if (terms.length === 0) return DecorationSet.empty;
  const { text, toDocPos } = flattenDocText(doc);
  const lower = text.toLowerCase();

  const found: { start: number; end: number }[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    while (true) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      found.push({ start: at, end: at + term.length });
      from = at + term.length;
    }
  }
  if (found.length === 0) return DecorationSet.empty;
  found.sort((a, b) => a.start - b.start);

  // Only the first occurrence in the active block gets the "active" style -
  // exact-occurrence-level active tracking across a block with several
  // rich-text sub-fields (e.g. each checklist item is its own editor
  // instance sharing one blockId) isn't worth the bookkeeping; this is close
  // enough for a visual "you are here" cue, with the *count* of full matches
  // still tracked precisely by lib/searchHighlight.ts for the toolbar.
  const decorations = found.map((m, i) =>
    Decoration.inline(toDocPos(m.start), toDocPos(m.end), { class: isActive && i === 0 ? "search-match search-match-active" : "search-match" }),
  );
  return DecorationSet.create(doc, decorations);
}

/**
 * Purely visual, same re-scan-from-scratch approach as TemplateHighlight.ts.
 * Unlike that extension, the thing that changes here (which words to
 * highlight, which block is "active") isn't a doc edit - it's driven by
 * external state (the search-match toolbar). `termsRef`/`isActiveRef` are
 * refs mutated by useMarkdownEditor.ts's effect, then a no-op meta
 * transaction is dispatched to force this plugin to recompute - see that
 * file for why refs instead of TipTap's normal `editor.setOptions()` (which
 * would recreate the extensions array on every navigation and risk the same
 * dropped-keystroke issue that array is deliberately memoized against).
 */
export const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return { termsRef: { current: [] }, isActiveRef: { current: false } };
  },

  addProseMirrorPlugins() {
    const { termsRef, isActiveRef } = this.options;
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc, termsRef.current, isActiveRef.current),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(searchHighlightKey) ? buildDecorations(tr.doc, termsRef.current, isActiveRef.current) : old),
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
