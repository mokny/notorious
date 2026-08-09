/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";
import type { PushNotificationPayload } from "@notorious/shared";

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

// Injected at build time by vite-plugin-pwa (injectManifest strategy) - the
// HTML entry is filtered out here and given its own NetworkFirst route
// below instead of precache's usual cache-first handling. Unlike every
// other entry (JS/CSS/... all hashed per build, so a cached copy can never
// go stale under a filename a later deploy would reuse), index.html's own
// URL never changes between deploys - cache-first for it risks serving an
// old shell whose script tags reference chunk files a *later* deploy already
// deleted from disk. That's exactly the "stale shell + already-gone chunks"
// combination that caused a blank white screen on a fresh cold launch of
// the installed PWA: `skipWaiting`/`clientsClaim` above only help a tab
// that's already open when an update lands (see main.tsx's own
// `controllerchange` reload) - they can't do anything for the very first
// navigation of a cold start, which is served by whatever service worker
// was *already* active before this one even finished installing.
function urlOf(entry: (typeof self.__WB_MANIFEST)[number]): string {
  return typeof entry === "string" ? entry : entry.url;
}
precacheAndRoute(self.__WB_MANIFEST.filter((entry) => !urlOf(entry).endsWith(".html")));

// Always tries the network first for a full-page navigation (falling back
// to whatever was last successfully cached only if the network is
// unreachable within 3s) - the same "prefer freshness over a stale cache"
// policy this service worker already applies to object/API data (see
// vite.config.ts's own comment on that), now applied to the app shell too.
//
// denylist excludes downloadable static files from this catch-all: iOS Safari treats a `download`
// anchor click as a normal top-level navigation rather than a same-page fetch, so without this the
// browser navigates to e.g. /notorious.shortcut and NavigationRoute hands back the cached app shell
// (index.html) instead of the actual file - a silent "download" of the wrong content.
registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 3 }), {
    denylist: [/\.shortcut$/],
  }),
);

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json() as PushNotificationPayload;

  // Silent signal (no visible notification of its own) telling us to close
  // an already-shown, same-`tag` call notification - see
  // calls/service.ts::endCall on the server, which sends this the moment a
  // call ends/is answered elsewhere/times out. Necessary because the call
  // notification below is `requireInteraction: true` and would otherwise
  // never disappear on its own.
  if (payload.type === "call-closed") {
    event.waitUntil(self.registration.getNotifications({ tag: payload.tag }).then((notifications) => notifications.forEach((n) => n.close())));
    return;
  }

  const isCall = payload.type === "call";
  const data: { type: string; url: string; callId?: string; conversationId?: string } = {
    type: payload.type,
    url: payload.url,
    ...(isCall ? { callId: payload.callId, conversationId: payload.conversationId } : {}),
  };

  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    data,
    ...(isCall
      ? {
          tag: payload.tag,
          // Without this, the call notification could vanish on its own
          // before the 60s ring window is over - it's closed explicitly
          // instead, via the `call-closed` push above.
          requireInteraction: true,
          actions: [
            { action: "accept", title: "Accept" },
            { action: "decline", title: "Decline" },
          ],
        }
      : {}),
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      // Best-effort: this is what makes the app-icon badge update while the
      // app is backgrounded/fully closed, not just live via the WS-driven
      // path in chatBadge.ts (which only runs while a tab/PWA instance is
      // open). `setAppBadge`/`clearAppBadge` are part of the Badging API's
      // WorkerNavigator mixin, so they exist on `self.navigator` here too -
      // guarded the same way chatBadge.ts guards the foreground call, since
      // support is inconsistent (works in Chromium and iOS 16.4+ standalone
      // PWAs, absent in Firefox).
      "setAppBadge" in self.navigator && payload.type === "chat-message" && typeof payload.badge === "number"
        ? payload.badge > 0
          ? (self.navigator as unknown as { setAppBadge(count?: number): Promise<void> }).setAppBadge(payload.badge).catch(() => {})
          : (self.navigator as unknown as { clearAppBadge(): Promise<void> }).clearAppBadge().catch(() => {})
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data as { type?: string; url: string; callId?: string; conversationId?: string };
  event.notification.close();

  // "Decline" needs no window at all - the server-side effect (ending the
  // call) is identical to declining from the in-app banner, just fired
  // directly from here. Every platform that doesn't support notification
  // actions (notably iOS Safari) simply never produces this `event.action`,
  // so it falls through to the plain-tap path below instead - no separate
  // handling needed for that.
  if (event.action === "decline" && data.callId) {
    event.waitUntil(fetch(`/api/v1/calls/${data.callId}/decline`, { method: "POST" }));
    return;
  }

  // "Accept" is itself the explicit confirmation (same as tapping Accept on
  // the in-app banner), so it jumps straight into the call instead of just
  // opening the thread - see ChatThreadPage.tsx's `?join=` handling. A plain
  // tap on the notification body (no action) only opens the thread, where
  // the still-ringing call is picked up by CallContext.tsx's own state and
  // shown as the normal accept/decline banner.
  const url = event.action === "accept" && data.callId && data.conversationId ? `/messages/${data.conversationId}?join=${data.callId}` : data.url;

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((client) => client.url.includes(data.url));
      if (existing) return existing.navigate(url).then((client) => client?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
