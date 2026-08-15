import { createContext, useContext, type PointerEvent } from "react";
import type { BlockType, ObjectType } from "@notorious/shared";

export interface BlockEditorActions {
  workspaceId: string;
  objectId: string;
  /** For the add-block/slash menu's per-object-type "create a new X" entries - see SlashCommand.ts. */
  objectTypes: ObjectType[];
  /**
   * The chain of object ids "currently open," from the top-level object down
   * to (and including) this editor's own `objectId` - a sub_object block in
   * "embed" display mode (see SubObjectContent) reads this to detect a
   * circular embed (A embeds B embeds A) before recursing into a nested
   * BlockEditor, and passes `[...embedAncestorIds, objectId]` down into it.
   * See SubObjectBlock.tsx.
   */
  embedAncestorIds: string[];
  /**
   * True while this content can't be edited (the object is locked, or this
   * is a sub_object block's embedded preview - always read-only regardless
   * of lock state, see SubObjectBlock.tsx). Read directly by each rich-text
   * block (ParagraphBlock, HeadingBlock, ...) and ChecklistBlock to keep
   * text genuinely selectable/copyable while blocking edits - a plain CSS
   * `pointer-events: none` (still used for buttons/property inputs outside
   * the editor) would block text selection along with editing, which is
   * exactly what a locked object shouldn't do.
   */
  readOnly: boolean;
  /**
   * This object's template-rendered block text (see modules/templates/ on
   * the server) - blockId -> field name -> rendered text, only present for
   * fields whose raw source actually contains `{{ }}`/`{% %}` syntax. Read
   * directly by each templatable block (ParagraphBlock, ChecklistBlock, ...)
   * via `TemplatableMarkdown.tsx`/`useTemplatableField.ts`, which show this
   * instead of the raw source whenever that specific field isn't focused -
   * clicking in reveals the editable `{{ }}` source, blurring renders it
   * again. `null` while still loading, or for an embedded/nested editor that
   * hasn't been given one (see BlockEditor.tsx).
   */
  renderedBlocks: Record<string, Record<string, string>> | null;
  /**
   * True while the `renderedBlocks` fetch above is still in flight (e.g. a
   * slow template field running `http.get`). `useTemplatableField.ts` uses
   * this to hold off auto-focusing a templatable field until it resolves -
   * otherwise the field would auto-focus into its raw `{{ }}` source with
   * TemplateSuggestion's cursor-position popup firing on it before the
   * rendered value is known. Always `false` for an embedded editor that
   * hasn't been given a `renderedBlocks` map (see BlockEditor.tsx).
   */
  renderedBlocksLoading: boolean;
  createBlockAfter: (parentBlockId: string | null, afterBlockId: string | null, type: BlockType, extraContent?: Record<string, unknown>) => void;
  updateBlockContent: (blockId: string, content: Record<string, unknown>) => Promise<void>;
  /** Exempt from the object lock - see toggleChecklistItemSchema and ChecklistBlock.tsx. */
  toggleChecklistItem: (blockId: string, itemId: string, checked: boolean) => Promise<void>;
  /** Exempt from the object lock - see reorderChecklistItemsSchema and ChecklistBlock.tsx. */
  reorderChecklistItems: (blockId: string, itemIds: string[]) => Promise<void>;
  /** Owner-only, exempt from the object lock - see toggleWhiteboardPresentingSchema and WhiteboardBlock.tsx. */
  toggleWhiteboardPresenting: (blockId: string, presenting: boolean) => Promise<void>;
  /** Owner-only, exempt from the object lock - see updateVotingSettingsSchema and VotingBlock.tsx. */
  updateVotingSettings: (blockId: string, allowMultipleVotes: boolean, votingEndsAt: string | null) => Promise<void>;
  deleteBlock: (blockId: string) => void;
  /** Writes the block's content to the clipboard (HTML/plaintext + the lossless Notorious format, see lib/blockClipboard.ts) - used by BlockContextMenu.tsx's Copy when there's no active text selection to copy instead. */
  copyBlock: (blockId: string) => void;
  /** Same clipboard write as `copyBlock`, then deletes the block. */
  cutBlock: (blockId: string) => void;
  /** Inserts a copy of the block with the same type/content right after it. */
  duplicateBlock: (blockId: string) => void;
  /** Recreates the block as `type` (best-effort content carried over between the markdown-based rich-text types, see lib/blockClipboard.ts's `turnIntoContent`) in the same position, then deletes the original - the PATCH endpoint has no way to change a block's `type` in place (see blocks/service.ts's `updateBlock`). */
  turnIntoBlock: (blockId: string, type: BlockType) => void;
  /** Selects every block's rendered text as one native browser selection, spanning block boundaries - what the context menu's "Select all" does, since each block is its own small TipTap instance rather than one shared document. */
  selectAllInEditor: () => void;
  moveBlock: (blockId: string, parentBlockId: string | null, afterBlockId: string | null) => void;
  /** The block that should receive focus once it appears (set right after Enter creates one). */
  pendingFocusBlockId: string | null;
  clearPendingFocus: () => void;
  /** True for the whole editor while any block is being dragged - not just the one under the pointer, so every block's move handle stays visible as a drop-target cue. */
  isDraggingAny: boolean;
  /** Bind as `onPointerDownCapture` on whatever element carries a block's dnd-kit `listeners` - see useDragSelectGuard.ts. */
  onTouchArmStart: (event: PointerEvent) => void;
  /** Which block's edit history shows in the Properties sidebar (see BlockHistoryPanel.tsx) - lifted above the editor since the sidebar isn't part of this component tree. */
  selectedBlockId: string | null;
  selectBlock: (blockId: string) => void;
  /**
   * Which block's context menu is open and where it should be anchored -
   * `x`/`y` are viewport (client) coordinates, either the touch point of a
   * long-press-then-release-without-moving (see BlockEditor.tsx's
   * handleDragEnd and blockGestures.ts: on touch, the drag handle/id/delete
   * buttons are removed entirely to reclaim content width, so this menu
   * bundles what those buttons used to do) or the desktop right-click event
   * that opened it (see BlockItem.tsx's `onContextMenu`). `null` when closed.
   */
  contextMenu: { blockId: string; x: number; y: number } | null;
  openBlockMenu: (blockId: string, x: number, y: number) => void;
  closeBlockMenu: () => void;
  /**
   * Search-result navigation (see SearchPage.tsx's `?highlight=` param and
   * BlockEditor.tsx's match scanning) - which words every rich-text editor
   * should highlight, and which single block currently owns the "active"
   * (brighter) highlight. `null` when no search navigation is active, which
   * every editor's SearchHighlight extension treats as "no terms" (cheap
   * no-op, see useMarkdownEditor.ts).
   */
  searchHighlight: { terms: string[]; activeBlockId: string | null } | null;
  /** Block ids a search-match navigation has force-opened (see ToggleBlock.tsx) so a match hidden inside a manually-collapsed toggle becomes visible. */
  forcedOpenBlockIds: Set<string>;
  forceOpenBlock: (blockId: string) => void;
}

const BlockEditorContext = createContext<BlockEditorActions | null>(null);

export const BlockEditorProvider = BlockEditorContext.Provider;

export function useBlockEditor(): BlockEditorActions {
  const context = useContext(BlockEditorContext);
  if (!context) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return context;
}
