import type { Block } from "@notorious/shared";
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

/** Same recursive string-leaf walk as the server's search indexer (modules/search/indexer.ts's `extractText`) - kept in sync by hand so a term found here is the same text the search index itself matched against. */
export function extractBlockText(content: Record<string, unknown>): string {
  const parts: string[] = [];
  function visit(value: unknown): void {
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) visit(v);
    }
  }
  visit(content);
  return parts.join(" ");
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
 */
export function findSearchMatches(blocksInOrder: Block[], query: string): SearchMatch[] {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return [];
  const matches: SearchMatch[] = [];
  for (const block of blocksInOrder) {
    const found = findTextMatches(extractBlockText(block.content), terms);
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
