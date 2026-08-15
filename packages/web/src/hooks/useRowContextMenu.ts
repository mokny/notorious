import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { isNativeMenuOverride } from "../components/ui/ContextMenu.js";
import { TAP_MOVEMENT_TOLERANCE_PX } from "../components/editor/blockGestures.js";

export interface RowContextMenuState {
  objectId: string;
  x: number;
  y: number;
}

/**
 * Shared open/close state for a view row/card's context menu (see
 * BoardView.tsx and friends). A plain desktop right-click - and, on touch,
 * the browser's own native long-press-fires-`contextmenu` behavior - covers
 * every view except Board, whose cards are already a dnd-kit `TouchSensor`
 * drag source: dnd-kit's touch listener consumes the gesture before that
 * native long-press timer ever fires, the same reason the block editor needs
 * its own long-press-without-moving detection (see blockGestures.ts) instead
 * of just leaning on `onContextMenu`. `openFromDragEnd` is that same
 * detection, reused here for Board's `handleDragEnd`.
 */
export function useRowContextMenu() {
  const [menu, setMenu] = useState<RowContextMenuState | null>(null);

  function openFromMouseEvent(objectId: string, event: ReactMouseEvent): void {
    if (isNativeMenuOverride(event)) return;
    event.preventDefault();
    setMenu({ objectId, x: event.clientX, y: event.clientY });
  }

  /** Returns true if this drag end was actually a long-press-without-moving that opened the menu (see BoardView.tsx: the caller should skip its own drag-end handling in that case). */
  function openFromDragEnd(objectId: string, activatorEvent: Event, delta: { x: number; y: number }): boolean {
    if (activatorEvent.type !== "touchstart") return false;
    if (Math.abs(delta.x) >= TAP_MOVEMENT_TOLERANCE_PX || Math.abs(delta.y) >= TAP_MOVEMENT_TOLERANCE_PX) return false;
    const touch = (activatorEvent as TouchEvent).touches[0] ?? (activatorEvent as TouchEvent).changedTouches[0];
    setMenu({ objectId, x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
    return true;
  }

  /** A quick two-finger tap (see useTwoFingerTap.ts) - a faster alternative to the long-press above, and unaffected by Board's dnd-kit drag sensor since it's never a single-finger gesture. */
  function openAt(objectId: string, x: number, y: number): void {
    setMenu({ objectId, x, y });
  }

  return { menu, openFromMouseEvent, openFromDragEnd, openAt, close: () => setMenu(null) };
}
