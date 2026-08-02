import { useLayoutEffect, useState, type RefObject } from "react";

const VIEWPORT_MARGIN = 8;
/** Matches the popovers' own `mt-1`. */
const GAP = 4;

/**
 * Positions a *portaled* popover (rendered into `document.body` via
 * `createPortal` - see BlockSlugButton.tsx/ObjectSlugButton.tsx's own doc
 * comments for why they need that) at a fixed viewport position anchored to
 * `anchorRef`'s bottom-right corner, clamped so it never spills off-screen.
 * `position: fixed` (not `absolute`) because a portaled element has no
 * meaningful positioned ancestor to be `absolute` relative to anymore - its
 * coordinates need to be viewport-relative either way, which is exactly
 * what `getBoundingClientRect()` already returns.
 *
 * Recomputed on open, on resize, and on scroll anywhere in the document
 * (capture-phase - a plain bubbling listener on `window` never sees
 * scrolling inside `<main>`'s own `overflow-y-auto`, see WorkspaceLayout.tsx)
 * so the popover tracks its anchor instead of visually detaching from it
 * mid-scroll.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  active: boolean,
): { position: "fixed"; top: number; left: number } | undefined {
  const [style, setStyle] = useState<{ position: "fixed"; top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setStyle(null);
      return;
    }

    function recompute(): void {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const anchorRect = anchor.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const left = Math.min(Math.max(anchorRect.right - width, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
      const top = Math.min(Math.max(anchorRect.bottom + GAP, VIEWPORT_MARGIN), window.innerHeight - height - VIEWPORT_MARGIN);
      setStyle({ position: "fixed", top, left });
    }

    recompute();
    window.addEventListener("resize", recompute);
    document.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      document.removeEventListener("scroll", recompute, true);
    };
  }, [active, anchorRef, popoverRef]);

  return style ?? undefined;
}
