import { useLayoutEffect, useState, type RefObject } from "react";

const VIEWPORT_MARGIN = 8;

/**
 * Nudges an absolutely-positioned popover back inside the viewport once its
 * size is known, instead of letting it spill off the edge of the screen -
 * see BlockSlugButton.tsx/ObjectSlugButton.tsx, whose "set the id" popovers
 * are anchored `right-0` off a trigger button that can sit anywhere from a
 * deeply-nested block's hover toolbar to a narrow phone screen, so there's
 * no single static position that's always safe. Returns a `style` object to
 * spread onto the popover element (a `transform: translate(...)`, or
 * `undefined` once/if it already fits).
 */
export function useKeepInViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setOffset(null);
      return;
    }

    function recompute(): void {
      const el = ref.current;
      if (!el) return;
      // Undo any previous nudge before measuring, so repeated resizes measure
      // this popover's natural (un-shifted) position each time rather than
      // compounding the last correction.
      el.style.transform = "";
      const rect = el.getBoundingClientRect();
      let x = 0;
      let y = 0;
      if (rect.right > window.innerWidth - VIEWPORT_MARGIN) x -= rect.right - (window.innerWidth - VIEWPORT_MARGIN);
      if (rect.left + x < VIEWPORT_MARGIN) x += VIEWPORT_MARGIN - (rect.left + x);
      if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) y -= rect.bottom - (window.innerHeight - VIEWPORT_MARGIN);
      if (rect.top + y < VIEWPORT_MARGIN) y += VIEWPORT_MARGIN - (rect.top + y);
      setOffset(x || y ? { x, y } : null);
    }

    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [active, ref]);

  return offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined;
}
