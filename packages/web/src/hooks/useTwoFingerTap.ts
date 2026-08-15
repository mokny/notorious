import { useRef, type TouchEvent as ReactTouchEvent } from "react";

/** How far either finger may drift from where it started and still count as a tap, not a pinch/pan. */
const MOVEMENT_TOLERANCE_PX = 12;
/** How long the two fingers may stay down and still count as a tap, not a sustained two-finger hold/gesture. */
const MAX_DURATION_MS = 500;

interface TwoFingerGesture {
  startTime: number;
  points: { id: number; x: number; y: number }[];
}

/**
 * A quick two-finger tap - both fingers down together, barely moving, both
 * lifted again within half a second - as a faster alternative to a
 * long-press for opening a context menu on touch (see BlockItem.tsx and the
 * view row components, which both already open theirs via a long-press).
 * Native `touchstart`/`touchmove`/`touchend` rather than Pointer Events:
 * telling "how many fingers are down right now" apart from "which single
 * pointer is this event about" is exactly what `TouchEvent.touches` gives
 * for free and Pointer Events don't. Calls `onTap` with the midpoint between
 * the two fingers' starting positions. A third finger touching down at any
 * point aborts the gesture outright, so this never fires mid-pinch/mid-pan.
 */
export function useTwoFingerTap(onTap: (x: number, y: number) => void) {
  const gestureRef = useRef<TwoFingerGesture | null>(null);

  function onTouchStart(event: ReactTouchEvent): void {
    if (event.touches.length === 2) {
      gestureRef.current = {
        startTime: Date.now(),
        points: Array.from(event.touches).map((touch) => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY })),
      };
    } else if (event.touches.length > 2) {
      gestureRef.current = null;
    }
  }

  function onTouchMove(event: ReactTouchEvent): void {
    const gesture = gestureRef.current;
    if (!gesture) return;
    for (const touch of Array.from(event.touches)) {
      const start = gesture.points.find((point) => point.id === touch.identifier);
      if (!start) continue;
      if (Math.abs(touch.clientX - start.x) > MOVEMENT_TOLERANCE_PX || Math.abs(touch.clientY - start.y) > MOVEMENT_TOLERANCE_PX) {
        gestureRef.current = null;
        return;
      }
    }
  }

  function onTouchEnd(event: ReactTouchEvent): void {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (event.touches.length > 0) return; // still one finger down - wait for the last lift
    gestureRef.current = null;
    if (Date.now() - gesture.startTime > MAX_DURATION_MS) return;
    const [a, b] = gesture.points;
    if (!a || !b) return;
    onTap((a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  function onTouchCancel(): void {
    gestureRef.current = null;
  }

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
