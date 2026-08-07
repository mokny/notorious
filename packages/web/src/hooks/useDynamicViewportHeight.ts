import { useEffect } from "react";
import { isIOS } from "../lib/platform.js";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const POLL_INTERVAL_MS = 200;
const POLL_DURATION_MS = 3000;

/**
 * On a cold launch (tapping the home-screen icon), iOS's WKWebView
 * sometimes settles into its real, full-screen size a moment *after* the
 * page has already painted with a shorter one - window.innerHeight (and
 * env(safe-area-inset-bottom)) read short at first, leaving WorkspaceLayout
 * (sized off this) and BottomTabBar (position: fixed, so it tracks whatever
 * height the browser is currently reporting) both floating above the true
 * bottom edge until something re-reads the now-correct value.
 *
 * A previous version of this fix force-reloaded the page once, based on
 * comparing window.innerHeight against window.screen.height - but that
 * comparison double-counted the safe-area insets (they're already *inside*
 * innerHeight under viewport-fit=cover, not additional to it), so the
 * threshold it checked against essentially never tripped, and the only thing
 * that ever actually fixed the gap in practice was a manual pull-to-refresh
 * (itself just a plain reload - see usePullToRefresh.ts). The real fix
 * doesn't need a reload at all: just keep re-reading window.innerHeight for
 * the few seconds after launch during which WKWebView is still settling, and
 * publish it as a CSS var WorkspaceLayout's root sizes itself off (instead
 * of the `dvh` unit, which only reflects the same possibly-still-wrong
 * number). Once the browser's own number is right, ours is too, on the very
 * next tick - no full-page reload, no lost scroll position or in-progress
 * edits.
 */
export function useDynamicViewportHeight(): void {
  useEffect(() => {
    function publish() {
      document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
    }
    publish();
    if (!isIOS() || !isStandalone()) return;

    const interval = setInterval(publish, POLL_INTERVAL_MS);
    const timeout = setTimeout(() => clearInterval(interval), POLL_DURATION_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);
}
