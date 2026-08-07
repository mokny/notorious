import { tableCellField, tableDocToTextGrid, type Block, type TableContent } from "@notorious/shared";
import type { BlockNode } from "../components/editor/blockTree.js";

export interface SearchMatch {
  blockId: string;
  term: string;
  /** This match's 0-based position among all matches within its own block - lets the active match be highlighted precisely (not just "first in block") when several occurrences share a block. See SearchHighlight.ts. */
  occurrenceIndexInBlock: number;
}

export interface TextMatch {
  start: number;
  end: number;
  term: string;
}

/** Splits a search query into distinct lowercased words - see SearchPage.tsx's "highlight" query param. Each word is matched (and navigated between) independently, not just the exact phrase. */
export function splitSearchTerms(query: string): string[] {
  return Array.from(new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean)));
}

/** Excalidraw's `.excalidraw` scene format (see WhiteboardContent's own doc comment) - only enough of its shape to pull out visible text, not a full type. */
interface WhiteboardSceneElement {
  type?: string;
  text?: string;
}

/** Only `type: "text"` elements carry anything a user would recognize as text - every other element (rectangle, arrow, freedraw, ...) is pure drawing geometry (coordinates, colors, seeds, ids) that would otherwise show up as false-positive matches (e.g. a search for a short number matching some element's `seed` or `id`). */
function extractWhiteboardText(sceneJson: string | undefined): string {
  if (!sceneJson) return "";
  try {
    const scene = JSON.parse(sceneJson) as { elements?: WhiteboardSceneElement[] };
    return (scene.elements ?? [])
      .filter((el) => el.type === "text" && typeof el.text === "string")
      .map((el) => el.text as string)
      .join(" ");
  } catch {
    return "";
  }
}

/**
 * Extracts the text a user would actually recognize as "this block's
 * content" - type-aware, not a blind recursive walk of every string in the
 * block's JSON. An earlier, generic version of this walked ids, colors,
 * ProseMirror node `type`s, ProseMirror `marks[].attrs` (e.g. a link's raw
 * `href`), and whiteboard drawing geometry right along with real text,
 * causing false-positive matches (a number matching some unrelated
 * whiteboard element's id/seed, "table" matching any table block via its own
 * `"type": "table"` node, etc).
 *
 * `renderedFields` (this object's `renderedBlocks[block.id]`, see
 * BlockEditorContext.tsx) is consulted first for every templatable field -
 * matching what modules/templates/renderer.ts's `getTemplatableFields`
 * templates server-side - so a `{{ }}`/`{% %}` field is matched (and
 * highlighted) by its rendered, user-visible value instead of its raw
 * template source. Falls back to the raw field when that field's rendered
 * value isn't present (no template syntax in it, or the fetch hasn't
 * resolved yet).
 */
export function extractBlockText(block: Pick<Block, "id" | "type" | "content">, renderedFields?: Record<string, string>): string {
  const content = block.content as Record<string, unknown>;
  function field(key: string, raw: unknown): string {
    const value = renderedFields?.[key] ?? raw;
    return typeof value === "string" ? value : "";
  }

  switch (block.type) {
    case "paragraph":
    case "quote":
    case "callout":
      return field("markdown", content.markdown);
    case "heading":
      return field("markdown", content.markdown);
    case "toggle":
      return field("summaryMarkdown", content.summaryMarkdown);
    case "checklist": {
      const items = Array.isArray(content.items) ? (content.items as { markdown?: unknown }[]) : [];
      return items.map((item, i) => field(`items.${i}`, item.markdown)).join(" ");
    }
    case "table": {
      const grid = tableDocToTextGrid((content as unknown as TableContent).doc);
      const parts: string[] = [];
      grid.forEach((row, r) => row.forEach((cellText, c) => parts.push(field(tableCellField(r, c), cellText))));
      return parts.join(" ");
    }
    case "code":
      return typeof content.code === "string" ? content.code : "";
    case "mermaid":
      return typeof content.code === "string" ? content.code : "";
    case "math":
      return typeof content.latex === "string" ? content.latex : "";
    case "image":
    case "video":
      return typeof content.caption === "string" ? content.caption : "";
    case "bookmark":
      return [content.title, content.description].filter((v): v is string => typeof v === "string").join(" ");
    case "whiteboard":
      return extractWhiteboardText(content.sceneJson as string | undefined);
    case "voting": {
      const items = Array.isArray(content.items) ? (content.items as { title?: unknown; description?: unknown }[]) : [];
      return items
        .map((item) => [item.title, item.description].filter((v): v is string => typeof v === "string").join(" "))
        .join(" ");
    }
    // embed/divider/columns/database_view/sub_object/calendar carry no
    // field a user would recognize as this block's own readable text (a
    // sub_object's visible title belongs to the *linked* object, not this
    // block; embed/database_view/calendar are pure references/config).
    default:
      return "";
  }
}

/** Depth-first, top-to-bottom order matching how BlockList/BlockItem actually render the tree. */
export function flattenBlockTree(nodes: BlockNode[]): Block[] {
  const out: Block[] = [];
  function visit(list: BlockNode[]): void {
    for (const node of list) {
      out.push(node);
      visit(node.children);
    }
  }
  visit(nodes);
  return out;
}

/**
 * Every occurrence of every search word in `text`, in reading order.
 * Case-insensitive. Shared by findSearchMatches below (counts/orders matches
 * for the toolbar), SearchHighlight.ts (TipTap decorations) and
 * HighlightedText.tsx (plain-text rendering, e.g. checklist items) - one
 * matching algorithm so the toolbar's "N of M" always agrees with what's
 * actually drawn.
 */
export function findTextMatches(text: string, terms: string[]): TextMatch[] {
  const lower = text.toLowerCase();
  const found: TextMatch[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    while (true) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      found.push({ start: at, end: at + term.length, term });
      from = at + term.length;
    }
  }
  found.sort((a, b) => a.start - b.start);
  // Two search words that share letters (e.g. "ab"/"bc" over "abc") can
  // otherwise produce overlapping ranges - besides looking wrong once
  // highlighted, that would silently desync every consumer's occurrence
  // count from what's actually drawn.
  const deduped: TextMatch[] = [];
  let cursor = -1;
  for (const m of found) {
    if (m.start < cursor) continue;
    deduped.push(m);
    cursor = m.end;
  }
  return deduped;
}

/**
 * Ordered list of every occurrence of every search term across the given
 * blocks (in document order, occurrences within one block ordered by where
 * they appear in its flattened text) - drives the search-match toolbar's
 * next/prev navigation and its "X of Y" count (see BlockEditor.tsx).
 * `renderedBlocks` (BlockEditorContext.tsx's map of the same name) is
 * threaded through to `extractBlockText` so a templated field is matched by
 * its rendered value, not its raw `{{ }}` source.
 */
export function findSearchMatches(
  blocksInOrder: Block[],
  query: string,
  renderedBlocks?: Record<string, Record<string, string>> | null,
): SearchMatch[] {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return [];
  const matches: SearchMatch[] = [];
  for (const block of blocksInOrder) {
    const found = findTextMatches(extractBlockText(block, renderedBlocks?.[block.id]), terms);
    found.forEach((f, occurrenceIndexInBlock) => matches.push({ blockId: block.id, term: f.term, occurrenceIndexInBlock }));
  }
  return matches;
}

/** Ancestor chain (nearest first) of `blockId` within the flat block list - used to find which toggle blocks need to be force-opened to reveal a match. */
export function ancestorChain(blocks: Block[], blockId: string): Block[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const chain: Block[] = [];
  let current = byId.get(blockId)?.parentBlockId ?? null;
  while (current) {
    const block = byId.get(current);
    if (!block) break;
    chain.push(block);
    current = block.parentBlockId;
  }
  return chain;
}
