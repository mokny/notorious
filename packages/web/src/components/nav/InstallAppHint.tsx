import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import { useInstallPrompt } from "../../hooks/useInstallPrompt.js";
import { Icon } from "../ui/Icon.js";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari has no `display-mode` support - this legacy, iOS-only
    // property is the only way to tell there too.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  // iPadOS 13+ reports as "Macintosh" in the UA string with touch support
  // enabled - the classic UA check alone misses every iPad.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

/**
 * Nudges a logged-in visitor on a mobile browser toward installing Notorious
 * as a home-screen app - full-screen, no address bar, its own app-switcher
 * entry. Gated to real members (via `!shareToken` at the call site in
 * WorkspaceLayout.tsx): an anonymous share visitor has no account to
 * "install their copy" for, and would only be confused by the offer. Skipped
 * on desktop (the same install affordance already lives in the browser's own
 * address bar there) and once already installed, via `isStandalone()`.
 * Dismissal is remembered so this doesn't nag on every visit.
 */
export function InstallAppHint() {
  const [dismissed, setDismissed] = useLocalStorageState("notorious:install-hint-dismissed", false);
  const { canPrompt, promptInstall } = useInstallPrompt();
  const ios = isIOS();
  const android = isAndroid();

  if (dismissed || (!ios && !android) || isStandalone()) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-3 py-2 text-xs text-ink-muted md:hidden">
      <Icon name="smartphone" className="h-4 w-4 shrink-0 text-accent" />
      <span className="flex-1">
        {canPrompt ? (
          "Install Notorious on your phone for quick, full-screen access."
        ) : ios ? (
          <>
            Install Notorious: tap <Icon name="share" className="mx-0.5 inline h-3 w-3 align-text-bottom" /> then "Add to Home Screen".
          </>
        ) : (
          'Install Notorious: open your browser menu and choose "Add to Home screen" or "Install app".'
        )}
      </span>
      {canPrompt && (
        <button
          onClick={() => void promptInstall()}
          className="shrink-0 rounded-md bg-accent px-2 py-1 font-medium text-white hover:opacity-90"
        >
          Install
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
