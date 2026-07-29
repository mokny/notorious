import { createContext, useContext } from "react";
import type { BlockType } from "@notorious/shared";

export interface BlockEditorActions {
  workspaceId: string;
  objectId: string;
  createBlockAfter: (parentBlockId: string | null, afterBlockId: string | null, type: BlockType, extraContent?: Record<string, unknown>) => void;
  updateBlockContent: (blockId: string, content: Record<string, unknown>) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, parentBlockId: string | null, afterBlockId: string | null) => void;
}

const BlockEditorContext = createContext<BlockEditorActions | null>(null);

export const BlockEditorProvider = BlockEditorContext.Provider;

export function useBlockEditor(): BlockEditorActions {
  const context = useContext(BlockEditorContext);
  if (!context) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return context;
}
