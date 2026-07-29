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
  for (const list of byParent.values()) list.sort((a, b) => a.position.localeCompare(b.position));

  function attach(parentId: string | null): BlockNode[] {
    return (byParent.get(parentId) ?? []).map((block) => ({ ...block, children: attach(block.id) }));
  }

  return attach(null);
}
