/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

/**
 * Without these, a newly-deployed service worker sits in "waiting" state
 * until every tab from the *previous* deploy is closed - which for a
 * long-lived app tab can be indefinitely. Meanwhile that old tab keeps
 * getting served its stale precached index.html, which references JS/CSS
 * asset filenames the new deploy already deleted from disk (Vite hashes
 * change on every build), so those requests 404 and the page never mounts:
 * a blank white screen for anyone who already had the app open/installed
 * before the update. `skipWaiting` + `clientsClaim` make the new worker take
 * over immediately instead, and `cleanupOutdatedCaches` drops the old
 * manifest's now-unreachable cache entries.
 */
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Injected at build time by vite-plugin-pwa (injectManifest strategy).
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json() as { title: string; body: string; url?: string };

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((client) => client.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
