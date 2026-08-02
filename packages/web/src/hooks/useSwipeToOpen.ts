import { useEffect, useRef } from "react";

const EDGE_ZONE_PX = 24;
const SWIPE_THRESHOLD_PX = 60;

/**
 * Edge-swipe (touch starts within `EDGE_ZONE_PX` of the left edge, drags
 * right past `SWIPE_THRESHOLD_PX`) to open something - the mobile nav
 * drawer in WorkspaceLayout.tsx, whose hamburger button is otherwise the
 * only way to reach it. Starting the gesture anywhere but right at the edge
 * would make it fight normal horizontal scrolling/dragging elsewhere on the
 * page (a table, a drag-and-drop block); requiring it to begin in a strip
 * only a phone's edge-swipe would naturally start in avoids that.
 */
export function useSwipeToOpen(onOpen: () => void, enabled: boolean): void {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(event: TouchEvent): void {
      const touch = event.touches[0];
      startRef.current = touch && touch.clientX <= EDGE_ZONE_PX ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function onTouchMove(event: TouchEvent): void {
      const start = startRef.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // More vertical than horizontal so far - this is a scroll, not an
      // edge-swipe; stop tracking it as a candidate.
      if (Math.abs(dy) > Math.abs(dx)) {
        startRef.current = null;
        return;
      }
      if (dx > SWIPE_THRESHOLD_PX) {
        onOpen();
        startRef.current = null;
      }
    }

    function onTouchEnd(): void {
      startRef.current = null;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onOpen]);
}
