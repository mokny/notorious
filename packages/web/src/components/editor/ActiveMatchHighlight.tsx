import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Draws a ring around the search toolbar's currently active match - as an
 * independent overlay, not a class added to the match's own `.search-match`
 * span. A version that toggled `.search-match-active` directly on that span
 * was tried first and dropped: both TipTap (paragraph/heading/table cells)
 * and React (checklist items) own that DOM and periodically re-render it
 * (confirmed - the added class kept vanishing within ~1-2s, well before any
 * doc edit, apparently from routine background re-renders unrelated to
 * search at all), silently wiping a class mutated in from outside. Reading
 * the target's `getBoundingClientRect()` and drawing on top sidesteps that
 * entirely - nothing about this overlay depends on either owner's DOM
 * surviving unchanged.
 */
export function ActiveMatchHighlight({ blockId, occurrenceIndex }: { blockId: string | null; occurrenceIndex: number | null }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (blockId === null || occurrenceIndex === null) {
      setRect(null);
      return;
    }
    function update() {
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      const mark = blockEl?.querySelectorAll(".search-match")[occurrenceIndex as number];
      if (!mark) {
        setRect(null);
        return;
      }
      const r = mark.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    update();
    // A few delayed re-reads, not just one - the target may still be
    // settling into place right after this effect fires (a force-opened
    // toggle mounting its children, the smooth `scrollIntoView` still
    // animating).
    const timers = [50, 150, 350, 600].map((ms) => setTimeout(update, ms));
    // `true` (capture phase): scroll events don't bubble, but a capturing
    // listener on window still sees them fire on any scrollable ancestor,
    // which is what actually moves during the scroll-to-match animation.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [blockId, occurrenceIndex]);

  if (!rect) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-40 rounded-sm shadow-[0_0_0_2px_rgb(234_88_12),0_0_0_4px_rgb(234_88_12/0.35)]"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    />,
    document.body,
  );
}
