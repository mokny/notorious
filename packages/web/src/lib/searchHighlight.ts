import type { Block } from "@notorious/shared";
import type { BlockNode } from "../components/editor/blockTree.js";

export interface SearchMatch {
  blockId: string;
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
    const text = extractBlockText(block.content).toLowerCase();
    const found: { start: number; term: string }[] = [];
    for (const term of terms) {
      let from = 0;
      while (true) {
        const at = text.indexOf(term, from);
        if (at === -1) break;
        found.push({ start: at, term });
        from = at + term.length;
      }
    }
    found.sort((a, b) => a.start - b.start);
    for (const f of found) matches.push({ blockId: block.id, term: f.term });
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
