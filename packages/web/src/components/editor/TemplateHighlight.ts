import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { parseTemplate, TemplateSyntaxError } from "@notorious/shared";
import { findTemplateRegions, tokenizeExprForHighlight, flattenDocText } from "./templateSyntax.js";

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const { text, toDocPos } = flattenDocText(doc);
  if (!/\{\{|\{%|\{#/.test(text)) return DecorationSet.empty;

  const regions = findTemplateRegions(text);
  const decorations: Decoration[] = [];

  for (const region of regions) {
    decorations.push(Decoration.inline(toDocPos(region.start), toDocPos(region.start + 2), { class: "tpl-delim" }));
    decorations.push(Decoration.inline(toDocPos(region.innerEnd), toDocPos(region.end), { class: "tpl-delim" }));

    if (region.kind === "comment") {
      decorations.push(Decoration.inline(toDocPos(region.innerStart), toDocPos(region.innerEnd), { class: "tpl-comment" }));
      continue;
    }

    const inner = text.slice(region.innerStart, region.innerEnd);
    for (const token of tokenizeExprForHighlight(inner)) {
      decorations.push(
        Decoration.inline(toDocPos(region.innerStart + token.start), toDocPos(region.innerStart + token.end), { class: `tpl-${token.cls}` }),
      );
    }
  }

  // The real parser (@notorious/shared, shared with the server so it's the
  // exact same grammar) validates the field's *entire* text in one shot -
  // it doesn't track positions, so on failure every region in this field is
  // marked, each with the same error tooltip, rather than claiming a
  // precision this parser can't actually back up.
  try {
    parseTemplate(text);
  } catch (err) {
    const message = err instanceof TemplateSyntaxError ? err.message : "Template syntax error";
    for (const region of regions) {
      decorations.push(
        Decoration.inline(toDocPos(region.start), toDocPos(region.end), { class: "tpl-error", title: message }),
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

const templateHighlightKey = new PluginKey("templateHighlight");

/**
 * Purely visual: recomputes `{{ }}`/`{% %}`/`{# #}` decorations from scratch
 * on every doc change (`state.doc` isn't large for these fields - a single
 * paragraph/heading/cell of text - so re-scanning beats the complexity of
 * incrementally mapping a previous DecorationSet). See TemplateSuggestion.ts
 * for the companion autocomplete extension that reuses the same region scan.
 */
export const TemplateHighlight = Extension.create({
  name: "templateHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: templateHighlightKey,
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
