import { createContext, useContext } from "react";

/**
 * The block id of the nearest enclosing BlockItem - lets a deeply nested
 * rich-text editor (RichTextEditor.tsx) know which block it belongs to
 * without every intermediate *Block.tsx component having to thread a
 * `blockId` prop through just for this. Provided once per block in
 * BlockItem.tsx.
 */
const BlockIdContext = createContext<string | null>(null);

export const BlockIdProvider = BlockIdContext.Provider;

export function useCurrentBlockId(): string | null {
  return useContext(BlockIdContext);
}
