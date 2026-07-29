import type { Block } from "@notorious/shared";

export interface BlockNode extends Block {
  children: BlockNode[];
}

/** Turns the server's flat, position-ordered block list into a render-ready tree. */
export function buildBlockTree(blocks: Block[]): BlockNode[] {
  const byParent = new Map<string | null, Block[]>();
  for (const block of blocks) {
    const list = byParent.get(block.parentBlockId) ?? [];
    list.push(block);
    byParent.set(block.parentBlockId, list);
  }
  // Plain ordinal comparison, not `localeCompare`: position keys come from
  // fractional-indexing's base62 alphabet (0-9, A-Z, a-z, in that *ASCII*
  // order), and locale-aware collation sorts case differently (many locales
  // group "a" near the start of the alphabet regardless of case, rather than
  // after every uppercase letter) - which silently scrambled the render
  // order relative to what the server actually stored and returned.
  for (const list of byParent.values()) list.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  function attach(parentId: string | null): BlockNode[] {
    return (byParent.get(parentId) ?? []).map((block) => ({ ...block, children: attach(block.id) }));
  }

  return attach(null);
}
