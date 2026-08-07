import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { findTextMatches } from "../../lib/searchHighlight.js";
import { flattenDocText } from "./templateSyntax.js";

export const searchHighlightKey = new PluginKey("searchHighlight");

export interface SearchHighlightOptions {
  /** Lowercased search words - see BlockEditorContext.tsx's `searchHighlight`. */
  terms: string[];
}

function buildDecorations(doc: ProseMirrorNode, terms: string[]): DecorationSet {
  if (terms.length === 0) return DecorationSet.empty;
  const { text, toDocPos } = flattenDocText(doc);
  const found = findTextMatches(text, terms);
  if (found.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    found.map((m) => Decoration.inline(toDocPos(m.start), toDocPos(m.end), { class: "search-match" })),
  );
}

/**
 * Purely visual, same re-scan-from-scratch approach as TemplateHighlight.ts.
 * Only marks *every* occurrence of the search words - which single one is
 * currently "active" (the toolbar's brighter highlight) is applied
 * separately, directly on the DOM, by BlockEditor.tsx's scroll-to-match
 * effect (see its own comment for why). Baking the active occurrence into
 * this extension's own reactive options was tried first and dropped: getting
 * a fresh Extension instance wired into the *actually mounted* editor
 * reliably, on every navigation, proved unreliable in this app (React 18
 * StrictMode's double-render of `useEditor` appears to sometimes construct
 * the real editor from a discarded render's extensions) - `terms` itself
 * works fine here only because it rarely changes after mount, masking the
 * same underlying issue.
 */
export const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return { terms: [] };
  },

  addProseMirrorPlugins() {
    const { terms } = this.options;
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc, terms),
          // Cached (not just recomputed on every `decorations()` read via
          // `props`) so the *same* DecorationSet - and so the same DOM spans
          // - survives across transactions that don't touch this doc.
          // Otherwise ProseMirror was quietly tearing down and rebuilding
          // every `.search-match` span on essentially every re-render, which
          // wiped BlockEditor.tsx's own `.search-match-active` class the
          // instant after it set it - the actual cause of the "active
          // highlight doesn't stick" bug, not the extension-options
          // instability its ref-based predecessor had.
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc, terms) : old),
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
