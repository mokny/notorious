import { useEffect, type RefObject } from "react";

/**
 * Keeps whichever element is focused inside `containerRef` scrolled into
 * view above the on-screen keyboard. Mobile Safari/Chrome shrink
 * `visualViewport` (not the layout viewport) when the keyboard opens, so a
 * plain scroll-into-view on focus can still leave the caret sitting under
 * the keyboard - this re-runs once the viewport has actually finished
 * resizing, which is also what catches the keyboard opening on a block that
 * was focused before it appeared (e.g. tapping a checkbox, not text).
 */
export function useKeepFocusedElementVisible(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function scrollActiveIntoView() {
      const active = document.activeElement;
      const container = containerRef.current;
      if (active instanceof HTMLElement && container?.contains(active)) {
        active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (event.target instanceof HTMLElement && containerRef.current?.contains(event.target)) {
        // Give the keyboard's open animation/viewport resize time to settle
        // before measuring where the caret ended up.
        setTimeout(scrollActiveIntoView, 300);
      }
    }

    document.addEventListener("focusin", handleFocusIn);
    viewport.addEventListener("resize", scrollActiveIntoView);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      viewport.removeEventListener("resize", scrollActiveIntoView);
    };
  }, [containerRef]);
}
