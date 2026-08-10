import { useEffect, useState } from "react";

export interface KeyboardInset {
  /**
   * How much of the layout viewport's bottom edge is currently covered by
   * the on-screen keyboard (0 when it's closed) - `window.innerHeight`
   * doesn't shrink for this on iOS Safari/PWA, but `visualViewport` does, so
   * the gap between the two *is* the keyboard's height. Used to lift
   * `position: fixed` bottom-anchored UI (sheets, the phone bottom bar)
   * above the keyboard instead of relying on it staying pinned to a
   * shrinking layout viewport, which iOS/WKWebView doesn't reliably do.
   */
  bottom: number;
  /**
   * `visualViewport.offsetTop` - how far the visible viewport has panned
   * down inside the (unmoving) layout viewport. iOS scrolls the document to
   * bring a focused input into view, which pans the visible area like this
   * without actually resizing anything; a `position: fixed` element's `top`
   * stays put in layout-viewport coordinates, so it drifts out of the
   * visible area unless it adds this offset back in.
   */
  offsetTop: number;
}

export function useKeyboardInset(): KeyboardInset {
  const [state, setState] = useState<KeyboardInset>({ bottom: 0, offsetTop: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setState({
        bottom: Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop),
        offsetTop: vv!.offsetTop,
      });
    }
    // visualViewport's own resize/scroll events don't fire on app
    // relaunch, so if the app was last backgrounded with the keyboard open,
    // `bottom` can stay stuck at that stale non-zero value after resume -
    // the bottom pill then renders mid-screen instead of at the true
    // bottom. Recompute on resume too; a rAF delay gives the OS a tick to
    // settle visualViewport before trusting it.
    function onResume() {
      requestAnimationFrame(update);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, []);
  return state;
}
