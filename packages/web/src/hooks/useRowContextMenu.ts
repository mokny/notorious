import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { isNativeMenuOverride } from "../components/ui/ContextMenu.js";
import { wasLastPointerTouch } from "../lib/pointerTracking.js";

export interface RowContextMenuState {
  objectId: string;
  x: number;
  y: number;
}

/**
 * Shared open/close state for a view row/card's context menu (see
 * BoardView.tsx and friends). Opens on a desktop right-click or a
 * two-finger tap (see useTwoFingerTap.ts) - never a touch long-press, which
 * stays free to mean "start dragging" wherever dragging exists (BoardView)
 * instead of competing with it for the same gesture; `openFromMouseEvent`
 * suppresses a `contextmenu` event itself when it was actually triggered by
 * a touch long-press (see wasLastPointerTouch), since the browser fires the
 * same event for both with no per-event way to tell them apart otherwise.
 */
export function useRowContextMenu() {
  const [menu, setMenu] = useState<RowContextMenuState | null>(null);

  function openFromMouseEvent(objectId: string, event: ReactMouseEvent): void {
    if (isNativeMenuOverride(event)) return;
    if (wasLastPointerTouch()) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    setMenu({ objectId, x: event.clientX, y: event.clientY });
  }

  /** A quick two-finger tap (see useTwoFingerTap.ts) - the sole touch trigger for this menu. */
  function openAt(objectId: string, x: number, y: number): void {
    setMenu({ objectId, x, y });
  }

  return { menu, openFromMouseEvent, openAt, close: () => setMenu(null) };
}
