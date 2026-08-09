import { useEffect, useState } from "react";

/**
 * How much of the layout viewport's bottom edge is currently covered by the
 * on-screen keyboard (0 when it's closed) - `window.innerHeight` doesn't
 * shrink for this on iOS Safari/PWA, but `visualViewport` does, so the gap
 * between the two *is* the keyboard's height. Used to lift `position: fixed`
 * bottom-anchored UI (sheets, the phone bottom bar) above the keyboard
 * instead of relying on it staying pinned to a shrinking layout viewport,
 * which iOS/WKWebView doesn't reliably do.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setInset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
