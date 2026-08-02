import { useRef, useState } from "react";
import { useClickOutside } from "./useClickOutside.js";

/**
 * Touch-driven replacement for CSS `:hover`/`group-hover:opacity-100` on a
 * row that both navigates (a nested link) and reveals secondary buttons on
 * hover (pin, drag handle, ...) - see PinnedNavItem.tsx, the one place in
 * the app with this combination, and useHasHover.ts for why plain CSS
 * `:hover` can't be used for both at once on a touch device: a touch
 * browser treats the first tap on anything inside a `:hover`-styled
 * ancestor as simulating that hover, consuming it instead of following
 * through to a click - so the row's own link would need a *second* tap to
 * actually navigate, same as the buttons.
 *
 * `onTouchStart` here reveals the buttons via real component state instead
 * (no `:hover` CSS involved at all), which removes that ancestor's
 * `:hover` dependence entirely - a tap that lands on the link still
 * navigates immediately on the very first touch, while a tap that lands on
 * the row's own background reveals the (until-then-hidden) buttons for a
 * follow-up tap, closing again on a tap elsewhere (see useClickOutside).
 */
export function useTouchReveal<T extends HTMLElement>() {
  const [touched, setTouched] = useState(false);
  const containerRef = useRef<T>(null);
  useClickOutside(containerRef, () => setTouched(false), touched);

  return {
    touched,
    containerRef,
    onTouchStart: () => setTouched(true),
  };
}
