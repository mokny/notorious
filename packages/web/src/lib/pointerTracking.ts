let lastPointerType = "mouse";

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerType = event.pointerType;
    },
    { capture: true },
  );
}

/**
 * Whether the most recent pointerdown anywhere in the document was a touch -
 * used to tell a `contextmenu` event triggered by a touch long-press apart
 * from a real desktop right-click, since the browser fires the exact same
 * event type for both with no reliable per-event device signal otherwise.
 * BlockItem.tsx and every view row/card now suppress the former entirely -
 * on touch, the context menu is reachable only via a two-finger tap (see
 * useTwoFingerTap.ts), so a long-press stays free to mean "start dragging"
 * wherever dragging exists (the block editor, BoardView) instead of
 * fighting with "open the menu" for the same gesture. `pointerdown` (not
 * `touchstart`/`mousedown`) fires for both input types and always precedes
 * the `contextmenu` it's paired with, so tracking just the latest one here
 * is enough - no per-element wiring needed.
 */
export function wasLastPointerTouch(): boolean {
  return lastPointerType === "touch";
}
