import { useEffect, useState } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Whether the current pointer can genuinely hover (a mouse/trackpad) as
 * opposed to touch-only. Feeds the CSS-`:hover`-vs-touch split in
 * PinnedNavItem.tsx (see useTouchReveal.ts) - a touch browser treats the
 * first tap on anything inside a `:hover`-styled ancestor as simulating
 * that hover rather than following through to a click, so a row that both
 * navigates (via a nested link) and reveals secondary buttons on hover
 * needs two different reveal mechanisms depending on which kind of pointer
 * is actually in use, not just one CSS rule for both.
 */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(QUERY).matches));

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setHasHover(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return hasHover;
}
