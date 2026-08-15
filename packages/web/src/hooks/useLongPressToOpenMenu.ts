import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { LONG_PRESS_DELAY_MS, TAP_MOVEMENT_TOLERANCE_PX } from "../components/editor/blockGestures.js";

/**
 * A plain timer-based long-press-to-open-menu gesture, independent of
 * dnd-kit's drag machinery - for a locked/read-only block, whose normal
 * long-press-then-release-without-moving detection piggybacks on a drag
 * sensor (see BlockEditor.tsx's `handleDragEnd`) that's deliberately never
 * armed while locked (see BlockItem.tsx's `canLongPressDrag`): a locked
 * block must still open its context menu on a touch long-press, but must
 * never become draggable/swipeable to do it. Cancels on movement past the
 * same tolerance the drag-based gesture uses, or on pointer up/leave/cancel.
 */
export function useLongPressToOpenMenu(onOpen: (x: number, y: number) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function clear(): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }

  function onPointerDown(event: ReactPointerEvent): void {
    if (event.pointerType !== "touch") return;
    startRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => {
      if (startRef.current) onOpen(startRef.current.x, startRef.current.y);
      clear();
    }, LONG_PRESS_DELAY_MS);
  }

  function onPointerMove(event: ReactPointerEvent): void {
    if (!startRef.current) return;
    const dx = Math.abs(event.clientX - startRef.current.x);
    const dy = Math.abs(event.clientY - startRef.current.y);
    if (dx > TAP_MOVEMENT_TOLERANCE_PX || dy > TAP_MOVEMENT_TOLERANCE_PX) clear();
  }

  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear };
}
