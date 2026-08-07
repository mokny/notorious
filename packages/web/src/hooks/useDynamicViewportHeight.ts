import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isIOS } from "../lib/platform.js";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const SHRINK_THRESHOLD_PX = 8;
const HEAL_DELAY_MS = 140;
const POLL_INTERVAL_MS = 2000;
const SCROLL_NUDGE_DELAYS_MS = [50, 300, 800, 1500];

/**
 * How tall the viewport *should* be. window.screen.height is a genuinely
 * independent measurement from window.innerHeight/visualViewport.height/the
 * `dvh` unit - those are exactly the values this whole file exists because
 * iOS's WKWebView can report wrong, so comparing innerHeight against a
 * self-tracked "largest innerHeight ever seen" (an earlier version of this
 * hook did that) never actually detects anything if the very first
 * measurement is already wrong, which real-device testing showed is
 * genuinely the case here (confirmed via a debug overlay: innerHeight read
 * 894 from the very first paint, no earlier "correct" value was ever
 * observed to fall from). screen.height doesn't share that failure mode -
 * it's what caught the mismatch reliably enough to fire the old reload-based
 * fix (that fix's problem was the reload itself not helping, not the
 * detection). Falls back to screen.width in landscape, where the shorter
 * dimension is the relevant one.
 */
export function expectedHeight(): number {
  return window.innerWidth > window.innerHeight ? window.screen.width : window.screen.height;
}

/**
 * Nudges every currently-scrollable ancestor by 1px and back - on a cold
 * launch of an installed iOS standalone PWA, the bar sitting too high (with
 * a dead gap below it) fixes itself the instant the user scrolls even
 * slightly - a complementary iOS WKWebView quirk from the keyboard-shrink
 * one `heal()` targets below: it only (re)computes its real content-view
 * bounds on the first scroll gesture, not on initial layout. This does that
 * same nudge programmatically instead of waiting for the user to discover
 * it by accident. `.overflow-y-auto` matches every scroll container in this
 * codebase (see CLAUDE.md's "conventions worth reusing").
 */
export function nudgeScrollableAncestors(): void {
  for (const el of document.querySelectorAll<HTMLElement>(".overflow-y-auto")) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const top = el.scrollTop;
    el.scrollTop = top + 1;
    el.scrollTop = top;
  }
  window.scrollTo(0, 1);
  window.scrollTo(0, 0);
}

export function publishAppVh(): void {
  document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
}

/** Forces WebKit to synchronously re-measure the viewport - see the file-level comment. Returns whether it ran (i.e. a mismatch was actually detected). */
export function healViewport(): boolean {
  if (expectedHeight() - window.innerHeight <= SHRINK_THRESHOLD_PX) return false;
  const el = document.body;
  const display = el.style.display;
  el.style.display = "none";
  void el.offsetHeight; // force a synchronous reflow, so WebKit re-measures before display is restored
  el.style.display = display;
  publishAppVh();
  return true;
}

/**
 * iOS's WKWebView has a well-documented standalone-PWA bug where
 * window.innerHeight/visualViewport.height/the `dvh` unit report several
 * dozen points shorter than the real screen (confirmed on a real device:
 * innerHeight=894 against a real screen.height=956, and it doesn't recover
 * on its own - not on blur, not on a page reload, not on deleting and
 * re-adding the home-screen icon from scratch, all tried and ruled out
 * diagnosing this). Only force-quitting the app resets it - or forcing
 * WebKit to synchronously re-measure by toggling `display` off and back on
 * on a full-viewport element, which `healViewport()` above does. Runs that
 * (and the scroll nudge above) on a poll for the lifetime of the app, and
 * again on every route change - a workspace's own scrollable `<main>` (and
 * thus anything for the nudge above to grab onto) only exists *after*
 * navigating past the workspace picker, which has nothing to scroll at all,
 * so a mount-once-only pass can end up doing all its work before that
 * content ever exists.
 */
export function useDynamicViewportHeight(): void {
  const location = useLocation();

  useEffect(() => {
    publishAppVh();

    if (!isIOS() || !isStandalone()) return;

    function onResize() {
      publishAppVh();
    }

    function onFocusOut() {
      setTimeout(healViewport, HEAL_DELAY_MS);
    }

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    document.addEventListener("focusout", onFocusOut);

    const interval = setInterval(healViewport, POLL_INTERVAL_MS);
    const nudgeTimers = SCROLL_NUDGE_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        nudgeScrollableAncestors();
        healViewport();
      }, delay),
    );
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
      clearInterval(interval);
      nudgeTimers.forEach(clearTimeout);
    };
  }, [location.pathname]);
}
