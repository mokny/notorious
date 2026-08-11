import { useRef } from "react";

const DRAGGING_CLASS = "dnd-dragging";

/**
 * Suppresses text selection for the duration of a dnd-kit drag - spread the
 * returned onDragStart/onDragEnd/onDragCancel onto a `DndContext` (merge with
 * the DndContext's own handlers where it already has any, e.g.
 * BlockEditor.tsx). Also bind `onTouchArmStart` as `onPointerDownCapture` on
 * whichever element carries dnd-kit's own drag `listeners`: touch's
 * TouchSensor has an activation delay before dnd-kit's onDragStart fires, and
 * the OS can win that race with its own long-press text-selection UI (the
 * "Look Up"/speak bubble) before the class below ever gets applied. Arming on
 * the raw touch pointerdown closes that gap; it's disarmed again on
 * pointerup/pointercancel if a drag never actually starts. See globals.css's
 * `.dnd-dragging` rule.
 */
export function useDragSelectGuard() {
  // Refs, not state - these never need to trigger a re-render, they only
  // ever toggle a class directly on document.body.
  const armedRef = useRef(false);
  const draggingRef = useRef(false);

  function sync() {
    document.body.classList.toggle(DRAGGING_CLASS, armedRef.current || draggingRef.current);
  }

  function onDragStart() {
    draggingRef.current = true;
    sync();
  }

  function onDragEnd() {
    draggingRef.current = false;
    sync();
  }

  function onTouchArmStart(event: React.PointerEvent) {
    if (event.pointerType !== "touch") return;
    armedRef.current = true;
    sync();
    const disarm = () => {
      armedRef.current = false;
      sync();
      window.removeEventListener("pointerup", disarm);
      window.removeEventListener("pointercancel", disarm);
    };
    window.addEventListener("pointerup", disarm, { once: true });
    window.addEventListener("pointercancel", disarm, { once: true });
  }

  return { onDragStart, onDragEnd, onDragCancel: onDragEnd, onTouchArmStart };
}
