import { useEffect, useState } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import { Icon } from "../ui/Icon.js";
import { enablePushNotifications, isPushSupported } from "../../lib/push/subscribe.js";

const SESSION_DISMISS_KEY = "notorious:push-banner-dismissed";

type BannerState = "hidden" | "prompt" | "blocked";

export function PushNotificationBanner() {
  const [optedOut, setOptedOut] = useLocalStorageState("notorious:push-opt-out", false);
  // Session-scoped, not localStorage: closing the banner is just "not now" -
  // it reappears on the next login/reload. Only the explicit Settings toggle
  // (which writes the localStorage flag above) makes it stop for good.
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(SESSION_DISMISS_KEY) === "1");
  const [state, setState] = useState<BannerState>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (optedOut || dismissed || !isPushSupported()) return;

    let cancelled = false;
    void (async () => {
      const permission = Notification.permission;
      if (permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled || subscription) return;

      if (permission === "granted") {
        // Permission was already granted earlier (e.g. a new device, or the
        // server-side subscription row was lost) - no new consent is needed,
        // so resubscribe silently instead of nagging with a banner.
        await enablePushNotifications();
        return;
      }

      if (!cancelled) setState("prompt");
    })();
    return () => {
      cancelled = true;
    };
  }, [optedOut, dismissed]);

  function dismiss() {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function handleEnable() {
    setBusy(true);
    try {
      const ok = await enablePushNotifications();
      if (ok) {
        setOptedOut(false);
        setState("hidden");
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden") return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-3 py-2 text-xs text-ink-muted">
      <Icon name="bell" className="h-4 w-4 shrink-0 text-accent" />
      <span className="flex-1">
        {state === "blocked"
          ? "Push notifications are blocked in your browser. Allow them in your browser's site settings to get reminders, mentions and invitations."
          : "Turn on push notifications to get reminders, mentions and invitations."}
      </span>
      {state === "prompt" && (
        <button
          onClick={() => void handleEnable()}
          disabled={busy}
          className="shrink-0 rounded-md bg-accent px-2 py-1 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Enable
        </button>
      )}
      <button onClick={dismiss} title="Dismiss" className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-raised hover:text-ink">
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
