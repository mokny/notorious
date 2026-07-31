import { createContext, useContext } from "react";
import type { BlockType } from "@notorious/shared";

export interface BlockEditorActions {
  workspaceId: string;
  objectId: string;
  createBlockAfter: (parentBlockId: string | null, afterBlockId: string | null, type: BlockType, extraContent?: Record<string, unknown>) => void;
  updateBlockContent: (blockId: string, content: Record<string, unknown>) => Promise<void>;
  /** Exempt from the object lock - see toggleChecklistItemSchema and ChecklistBlock.tsx. */
  toggleChecklistItem: (blockId: string, itemId: string, checked: boolean) => Promise<void>;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, parentBlockId: string | null, afterBlockId: string | null) => void;
  /** The block that should receive focus once it appears (set right after Enter creates one). */
  pendingFocusBlockId: string | null;
  clearPendingFocus: () => void;
  /** True for the whole editor while any block is being dragged - not just the one under the pointer, so every block's move handle stays visible as a drop-target cue. */
  isDraggingAny: boolean;
  /** Which block's edit history shows in the Properties sidebar (see BlockHistoryPanel.tsx) - lifted above the editor since the sidebar isn't part of this component tree. */
  selectedBlockId: string | null;
  selectBlock: (blockId: string) => void;
}

const BlockEditorContext = createContext<BlockEditorActions | null>(null);

export const BlockEditorProvider = BlockEditorContext.Provider;

export function useBlockEditor(): BlockEditorActions {
  const context = useContext(BlockEditorContext);
  if (!context) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return context;
}
