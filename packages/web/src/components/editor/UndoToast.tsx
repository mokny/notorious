/**
 * Fixed-position "<message> / Undo" toast - shown after a touch swipe-left
 * delete, the one delete path (block, checklist item, voting item - see
 * BlockEditor.tsx's performSwipeDelete and the matching
 * performSwipeDeleteItem in ChecklistBlock.tsx/VotingBlock.tsx) with no
 * confirmation step of its own. Each caller supplies its own restore logic
 * via `onUndo` - the block editor's replays the same history.undo()
 * Ctrl+Z already uses, the item-level ones just re-insert a locally held
 * snapshot, since neither checklist nor voting items are part of that
 * block-structure undo stack.
 */
export function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-surface shadow-xl">
        <span>{message}</span>
        <button type="button" onClick={onUndo} className="font-medium text-accent underline underline-offset-2">
          Undo
        </button>
      </div>
    </div>
  );
}
