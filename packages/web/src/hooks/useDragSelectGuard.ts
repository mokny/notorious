import { useRef } from "react";

const DRAGGING_CLASS = "dnd-dragging";

/**
 * Suppresses text selection for the duration of a dnd-kit drag - spread the
 * returned handlers onto a `DndContext`'s onDragStart/onDragEnd/onDragCancel
 * (merge with the DndContext's own handlers where it already has any, e.g.
 * BlockEditor.tsx). See globals.css's `.dnd-dragging` rule.
 */
export function useDragSelectGuard() {
  // Ref, not state - this never needs to trigger a re-render, it only ever
  // toggles a class directly on document.body.
  const draggingRef = useRef(false);

  function onDragStart() {
    if (draggingRef.current) return;
    draggingRef.current = true;
    document.body.classList.add(DRAGGING_CLASS);
  }

  function onDragEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.classList.remove(DRAGGING_CLASS);
  }

  return { onDragStart, onDragEnd, onDragCancel: onDragEnd };
}
