import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Draws a ring around the search toolbar's currently active match - as an
 * independent overlay, not a class added to the match's own `.search-match`
 * span. A version that toggled `.search-match-active` directly on that span
 * was tried first and dropped: both TipTap (paragraph/heading/table cells)
 * and React (checklist items) own that DOM and periodically re-render it,
 * silently wiping a class mutated in from outside within a second or two.
 * Reading the target's `getBoundingClientRect()` and drawing on top
 * sidesteps that entirely.
 *
 * Position is re-read on every animation frame (not just once, or via
 * scroll/resize listeners) while a match is active - the listener-based
 * version didn't reliably track the target either: this page has several
 * nested scroll containers (the object detail column, a tablet split-view
 * panel, ...) and the smooth `scrollIntoView` BlockEditor.tsx triggers is
 * itself just one of many things that can move the target without firing a
 * `scroll` event on the *specific* ancestor a listener happened to be on. A
 * per-frame `getBoundingClientRect()` read is cheap enough for the one
 * active element this ever tracks, and is correct regardless of *why* the
 * page moved.
 */
export function ActiveMatchHighlight({ blockId, occurrenceIndex }: { blockId: string | null; occurrenceIndex: number | null }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (blockId === null || occurrenceIndex === null) {
      setRect(null);
      return;
    }
    let raf: number;
    function tick() {
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      const mark = blockEl?.querySelectorAll(".search-match")[occurrenceIndex as number];
      if (!mark) {
        setRect((prev) => (prev === null ? prev : null));
      } else {
        const r = mark.getBoundingClientRect();
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        setRect((prev) => (sameRect(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blockId, occurrenceIndex]);

  if (!rect) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed top-0 left-0 z-40 rounded-sm shadow-[0_0_0_2px_rgb(234_88_12),0_0_0_4px_rgb(234_88_12/0.35)]"
      style={{ transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`, width: rect.width, height: rect.height }}
    />,
    document.body,
  );
}
