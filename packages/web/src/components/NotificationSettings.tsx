import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "./ui/Button.js";
import { enablePushNotifications, disablePushNotifications, isPushSupported } from "../lib/push/subscribe.js";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import { useAuth } from "../context/AuthContext.js";
import { authApi } from "../lib/api/resources.js";

export function NotificationSettings() {
  const { user, refetch } = useAuth();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const showWhenOpenMutation = useMutation({
    mutationFn: (pushShowWhenOpen: boolean) => authApi.updatePushPreferences({ pushShowWhenOpen }),
    onSuccess: () => refetch(),
  });
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
    <div>
      <Button variant={enabled ? "secondary" : "primary"} className="mt-3" onClick={toggle} disabled={busy}>
        {enabled ? "Disable push notifications" : "Enable push notifications"}
      </Button>
      {enabled && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={user?.pushShowWhenOpen ?? true}
            disabled={showWhenOpenMutation.isPending}
            onChange={(e) => showWhenOpenMutation.mutate(e.target.checked)}
          />
          Also notify me when the app is already open
        </label>
      )}
    </div>
  );
}
