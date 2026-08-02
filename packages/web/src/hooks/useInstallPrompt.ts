import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Captures Chrome/Edge's `beforeinstallprompt` event (fired once the browser
 * itself decides the page is installable - manifest + service worker, both
 * already set up in vite.config.ts) so InstallAppHint.tsx can trigger the
 * native install dialog from its own "Install" button instead of only
 * pointing at the browser's UI. `preventDefault()` suppresses Chrome's own
 * mini-infobar so this hint is the only prompt shown. Safari (iOS) never
 * fires this event at all - InstallAppHint.tsx falls back to text
 * instructions there.
 */
export function useInstallPrompt(): { canPrompt: boolean; promptInstall: () => Promise<void> } {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event): void {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function promptInstall(): Promise<void> {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return { canPrompt: Boolean(deferredPrompt), promptInstall };
}
