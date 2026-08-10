import { useEffect, useState } from "react";
import { Button } from "./ui/Button.js";
import { enablePushNotifications, disablePushNotifications, isPushSupported } from "../lib/push/subscribe.js";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";

export function NotificationSettings() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // Read by PushNotificationBanner.tsx: an explicit toggle-off here is the
  // only thing that permanently stops the login-time auto-enable prompt -
  // dismissing that banner itself is just a "not now" for the session.
  const [, setOptedOut] = useLocalStorageState("notorious:push-opt-out", false);

  useEffect(() => {
    setSupported(isPushSupported());
    if (isPushSupported()) {
      navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setEnabled(Boolean(subscription)));
    }
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
        setOptedOut(true);
      } else {
        const ok = await enablePushNotifications();
        setEnabled(ok);
        if (ok) setOptedOut(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return <p className="mt-3 text-sm text-ink-muted">Push notifications are not supported in this browser.</p>;
  }

  return (
    <Button variant={enabled ? "secondary" : "primary"} className="mt-3" onClick={toggle} disabled={busy}>
      {enabled ? "Disable push notifications" : "Enable push notifications"}
    </Button>
  );
}
