import { useEffect, useRef } from "react";
import { isIOS } from "../lib/platform.js";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const SHRINK_THRESHOLD_PX = 4;
const HEAL_DELAY_MS = 140;
const POLL_INTERVAL_MS = 2000;

/**
 * iOS's WKWebView has a well-documented standalone-PWA bug: the first time
 * the on-screen keyboard opens (a login field, a search box, anything), it
 * permanently shrinks window.innerHeight/visualViewport.height/the `dvh`
 * unit by roughly the keyboard's height and never recovers on its own - not
 * on blur, not on a page reload, not even on deleting and re-adding the
 * home-screen icon from scratch (all three were tried and ruled out
 * diagnosing this - a real device stayed at innerHeight=894 against a real
 * screen.height=956 no matter which of those we threw at it). Only
 * force-quitting the app resets it - or forcing WebKit to synchronously
 * re-measure by toggling `display` off and back on on a full-viewport
 * element, which is what `heal()` below does. Tracks the largest
 * innerHeight ever observed (our best evidence of the real, un-shrunk
 * height) and heals whenever the current one falls meaningfully short of
 * it - reactively on focusout (the moment a keyboard most likely just
 * closed) and defensively via a light poll, since not every trigger is a
 * text input blur.
 */
export function useDynamicViewportHeight(): void {
  const maxVH = useRef(window.innerHeight);

  useEffect(() => {
    function publish() {
      document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
    }
    publish();

    function heal() {
      if (maxVH.current - window.innerHeight <= SHRINK_THRESHOLD_PX) return;
      const el = document.body;
      const display = el.style.display;
      el.style.display = "none";
      void el.offsetHeight; // force a synchronous reflow, so WebKit re-measures before display is restored
      el.style.display = display;
      publish();
    }

    function onResize() {
      maxVH.current = Math.max(maxVH.current, window.innerHeight);
      publish();
    }

    function onFocusOut() {
      setTimeout(heal, HEAL_DELAY_MS);
    }

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    document.addEventListener("focusout", onFocusOut);

    if (!isIOS() || !isStandalone()) {
      return () => {
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        document.removeEventListener("focusout", onFocusOut);
      };
    }

    const interval = setInterval(heal, POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
      clearInterval(interval);
    };
  }, []);
}
