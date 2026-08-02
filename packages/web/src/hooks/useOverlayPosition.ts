import { useLayoutEffect, useState, type RefObject } from "react";

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function sameRect(a: OverlayRect | null, b: OverlayRect): boolean {
  return a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Continuously tracks `anchorRef`'s on-screen position - used to render a
 * *portaled* replacement element (see ObjectSlugButton.tsx) at the exact
 * same spot as an invisible placeholder left behind in the original layout
 * position, so the portaled element keeps reserving that space and stays
 * visually "in place" despite actually living in `document.body`.
 *
 * Recomputes after every render (not just on mount/resize/scroll) - unlike
 * a transient popover, which only needs an accurate position at the moment
 * it opens, this tracks something meant to look permanently anchored, so it
 * also needs to catch layout shifts that aren't a resize or a scroll (e.g.
 * the object's title growing/shrinking the toolbar row it sits in). Cheap
 * enough for one small icon-sized element; the `sameRect` check below skips
 * the `setState` (and the render it would otherwise trigger) whenever
 * nothing actually moved.
 */
export function useOverlayPosition(anchorRef: RefObject<HTMLElement | null>): OverlayRect | null {
  const [rect, setRect] = useState<OverlayRect | null>(null);

  useLayoutEffect(() => {
    function recompute(): void {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    }

    recompute();
    window.addEventListener("resize", recompute);
    document.addEventListener("scroll", recompute, true);
    // Catches layout shifts a React re-render never sees - an image finishing
    // its network load, a web font swapping in and changing text metrics, a
    // browser-chrome-only reflow, or anything else that isn't a resize, a
    // scroll, or a React state change. These are most likely on a cold first
    // load, before anything's cached, which is exactly when this element
    // would otherwise stay stuck at the *pre-shift* position it first
    // measured and never correct itself until something else happened to
    // force a re-render (a click, opening the popover, ...). Rather than
    // chase down and individually listen for every possible cause (a losing
    // game - tried a `load` listener plus `document.fonts.ready` here first,
    // neither was actually the cause for this app), just re-measure on every
    // animation frame for a short window after mount - cheap for one small
    // element, and correct regardless of what actually shifted it.
    let rafId: number;
    const settleBy = performance.now() + 1000;
    function pollWhileSettling(): void {
      recompute();
      if (performance.now() < settleBy) rafId = requestAnimationFrame(pollWhileSettling);
    }
    rafId = requestAnimationFrame(pollWhileSettling);
    return () => {
      window.removeEventListener("resize", recompute);
      document.removeEventListener("scroll", recompute, true);
      cancelAnimationFrame(rafId);
    };
  });

  return rect;
}
