import { useRef } from "react";
import type { Block } from "@notorious/shared";

export type BlockSnapshot = Pick<Block, "id" | "parentBlockId" | "type" | "content" | "position">;

interface MoveEndpoints {
  parentBlockId: string | null;
  afterBlockId: string | null;
}

type HistoryAction =
  | { kind: "create"; block: BlockSnapshot }
  | { kind: "delete"; block: BlockSnapshot }
  | { kind: "move"; blockId: string; from: MoveEndpoints; to: MoveEndpoints };

const MAX_HISTORY = 100;

export interface EditorHistoryCallbacks {
  /** Returns what the block actually looked like right before it was deleted (see applyInverse's note on why this matters). */
  onDelete: (blockId: string) => Promise<BlockSnapshot | null>;
  onRestore: (block: BlockSnapshot) => Promise<unknown>;
  onMove: (blockId: string, parentBlockId: string | null, afterBlockId: string | null) => Promise<unknown>;
}

/**
 * Editor-wide undo/redo (Ctrl+Z / Cmd+Z, see BlockEditor.tsx's keydown
 * handler) for the three block *structure* changes that have no undo of
 * their own: creating, deleting and moving/reordering a block. Content
 * edits deliberately aren't covered here - text blocks already have TipTap's
 * own History extension, plain `<textarea>`/`<input>`-backed blocks (code,
 * table, checklist) get free native browser undo, and the whiteboard block
 * has Excalidraw's own undo/redo toolbar buttons. Layering a second, coarser
 * undo system on top of those would fight the one already active wherever
 * the user's cursor actually is.
 *
 * Lives in a `useRef`-held stack, not React state: undo history doesn't need
 * to survive a remount (a fresh object opened via routing gets a fresh, empty
 * history, matching how most editors scope undo to "this document, this
 * session"), and pushing to a ref instead of state means recording a change
 * doesn't cost a re-render for every keystroke/action.
 */
export function useEditorHistory(callbacks: EditorHistoryCallbacks) {
  const undoStack = useRef<HistoryAction[]>([]);
  const redoStack = useRef<HistoryAction[]>([]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  function push(action: HistoryAction): void {
    undoStack.current.push(action);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    // A fresh action invalidates whatever redo history existed - standard
    // undo/redo semantics (redoing only makes sense right after an undo).
    redoStack.current = [];
  }

  // Best-effort: if the inverse call fails (e.g. someone else already
  // deleted the block this undo was about to restore), the stacks are left
  // as popped/pushed rather than rolled back - a rare edge case matching the
  // app's overall last-write-wins policy (see docs/ARCHITECTURE.md), not
  // worth a full compensating-transaction system for.
  //
  // Whenever this deletes a block (undoing a create, or redoing a delete),
  // it overwrites `action.block` with whatever content that delete actually
  // captured, in place, rather than leaving the action's original snapshot
  // untouched. Content edits aren't tracked by this hook (see the class doc
  // comment), so a block created and then typed into carries text the
  // "create" action's snapshot never saw; without refreshing it here, a
  // later redo of that create would resurrect the block *empty*, silently
  // discarding everything typed after it was created.
  async function applyInverse(action: HistoryAction, direction: "undo" | "redo"): Promise<void> {
    const cb = callbacksRef.current;
    if (action.kind === "create") {
      if (direction === "undo") {
        const fresh = await cb.onDelete(action.block.id);
        if (fresh) action.block = fresh;
      } else {
        await cb.onRestore(action.block);
      }
    } else if (action.kind === "delete") {
      if (direction === "undo") {
        await cb.onRestore(action.block);
      } else {
        const fresh = await cb.onDelete(action.block.id);
        if (fresh) action.block = fresh;
      }
    } else {
      const endpoints = direction === "undo" ? action.from : action.to;
      await cb.onMove(action.blockId, endpoints.parentBlockId, endpoints.afterBlockId);
    }
  }

  const api = useRef({
    recordCreate(block: BlockSnapshot): void {
      push({ kind: "create", block });
    },
    recordDelete(block: BlockSnapshot): void {
      push({ kind: "delete", block });
    },
    recordMove(blockId: string, from: MoveEndpoints, to: MoveEndpoints): void {
      push({ kind: "move", blockId, from, to });
    },
    undo(): void {
      const action = undoStack.current.pop();
      if (!action) return;
      redoStack.current.push(action);
      void applyInverse(action, "undo").catch(() => {});
    },
    redo(): void {
      const action = redoStack.current.pop();
      if (!action) return;
      undoStack.current.push(action);
      void applyInverse(action, "redo").catch(() => {});
    },
  }).current;

  return api;
}
