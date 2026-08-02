import { useEffect, useRef } from "react";

const PULL_THRESHOLD_PX = 80;
const MAX_HORIZONTAL_DRIFT_PX = 40;

/** Walks up from `node` to the nearest scrollable ancestor (falling back to the document itself), so a pull-down starting inside a nested `overflow-y-auto` panel (see WorkspaceLayout.tsx's `<main>`) is checked against *its* scroll position, not the outer window's (which never scrolls at all when the content that does is nested like that). */
function findScrollableAncestor(node: Element | null): Element {
  let el = node;
  while (el && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Pull-down-to-refresh, reimplemented in JS: an installed/standalone PWA (see
 * index.html's manifest) has no browser chrome, so it doesn't get the native
 * gesture a regular mobile browser tab already provides. Mirrors that native
 * behavior as closely as possible - the touch's nearest scrollable ancestor
 * must already be at its top when the gesture starts (otherwise this would
 * fire mid-scroll), pulled down past a threshold, before doing a full
 * `window.location.reload()` - the same reset a real browser refresh gives,
 * not a soft in-app data refetch.
 */
export function usePullToRefresh(): void {
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const scrollParent = useRef<Element | null>(null);

  useEffect(() => {
    function onTouchStart(event: TouchEvent): void {
      const touch = event.touches[0];
      if (!touch) return;
      scrollParent.current = findScrollableAncestor(event.target as Element | null);
      startY.current = scrollParent.current.scrollTop === 0 ? touch.clientY : null;
      startX.current = touch.clientX;
    }

    function onTouchMove(event: TouchEvent): void {
      if (startY.current === null) return;
      const touch = event.touches[0];
      if (!touch) return;
      // Drifted into more of a horizontal gesture (e.g. the edge-swipe that
      // opens the nav drawer elsewhere) - not a pull-down, stop tracking it.
      if (Math.abs(touch.clientX - startX.current) > MAX_HORIZONTAL_DRIFT_PX) {
        startY.current = null;
        return;
      }
      // The container scrolled out from under the pull (e.g. content loaded
      // and pushed it down) - no longer "pulling from the very top".
      if ((scrollParent.current?.scrollTop ?? 0) > 0) startY.current = null;
    }

    function onTouchEnd(event: TouchEvent): void {
      const start = startY.current;
      startY.current = null;
      if (start === null) return;
      const touch = event.changedTouches[0];
      if (touch && touch.clientY - start > PULL_THRESHOLD_PX) window.location.reload();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
