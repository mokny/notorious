import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { flattenDocText } from "./templateSyntax.js";

export const searchHighlightKey = new PluginKey("searchHighlight");

export interface SearchHighlightOptions {
  /** Lowercased search words - see BlockEditorContext.tsx's `searchHighlight`. */
  terms: string[];
  /** Whether *this* editor instance is the search toolbar's currently active block - see useMarkdownEditor.ts. */
  isActive: boolean;
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
 * Unlike that extension, `terms`/`isActive` are plain reactive options (not
 * refs) - useMarkdownEditor.ts includes them in its `extensions` memo's
 * dependency array, so navigating between search matches gets a fresh
 * Extension instance (and fresh decorations) instead of needing an
 * out-of-band refresh mechanism. A ref+meta-transaction version of this was
 * tried first but proved unreliable: React 18 StrictMode's double-render of
 * `useEditor` can end up wiring a *different* Plugin instance's closure than
 * the ref the rest of the component mutates, silently decorating nothing -
 * confirmed by tagging both sides with a debug id and finding they pointed
 * at two different ref objects. Recomputing decorations directly from a
 * `props.decorations` closure (no plugin *state* at all) sidesteps that
 * entirely - there's no ref to get out of sync with.
 */
export const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return { terms: [], isActive: false };
  },

  addProseMirrorPlugins() {
    const { terms, isActive } = this.options;
    return [
      new Plugin({
        key: searchHighlightKey,
        props: {
          decorations(state) {
            return buildDecorations(state.doc, terms, isActive);
          },
        },
      }),
    ];
  },
});
