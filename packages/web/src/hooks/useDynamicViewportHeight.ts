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
const SCROLL_NUDGE_DELAYS_MS = [50, 300, 800];

/**
 * Nudges every currently-scrollable ancestor by 1px and back - on a cold
 * launch of an installed iOS standalone PWA, the bar sitting too high (with
 * a dead gap below it) fixes itself the instant the user scrolls even
 * slightly, before any keyboard has ever been focused - a separate,
 * complementary iOS WKWebView quirk from the keyboard-shrink one `heal()`
 * targets below: it only (re)computes its real content-view bounds on the
 * first scroll gesture, not on initial layout. This does that same nudge
 * programmatically instead of waiting for the user to discover it by
 * accident. `.overflow-y-auto` matches every scroll container in this
 * codebase (see CLAUDE.md's "conventions worth reusing").
 */
function nudgeScrollableAncestors(): void {
  for (const el of document.querySelectorAll<HTMLElement>(".overflow-y-auto")) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const top = el.scrollTop;
    el.scrollTop = top + 1;
    el.scrollTop = top;
  }
  window.scrollTo(0, 1);
  window.scrollTo(0, 0);
}

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
 * text input blur. Also fires `nudgeScrollableAncestors()` a few times right
 * after a cold launch, for the separate not-yet-settled-bounds quirk above.
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
    const nudgeTimers = SCROLL_NUDGE_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        nudgeScrollableAncestors();
        heal();
      }, delay),
    );
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
      clearInterval(interval);
      nudgeTimers.forEach(clearTimeout);
    };
  }, []);
}
