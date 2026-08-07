/**
 * Fixed-position "Block deleted / Undo" toast - see BlockEditor.tsx's
 * performSwipeDelete, the only delete path that shows this (the touch
 * swipe-left gesture has no confirmation step of its own, unlike the
 * toolbar delete button or backspace-on-empty). "Undo" is wired to the same
 * history.undo() Ctrl+Z already uses, not a bespoke restore.
 */
export function UndoToast({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-surface shadow-xl">
        <span>Block deleted</span>
        <button type="button" onClick={onUndo} className="font-medium text-accent underline underline-offset-2">
          Undo
        </button>
      </div>
    </div>
  );
}
