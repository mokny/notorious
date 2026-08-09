/**
 * Wraps the PWA Badging API (`navigator.setAppBadge`/`clearAppBadge`) behind
 * a feature-detect guard - unsupported in plenty of browsers (notably
 * Firefox, and Safari outside an installed PWA), so this is always a
 * best-effort visual extra, never something a feature depends on. Count is
 * the number of conversations with >=1 unread message (not total unread
 * messages), computed server-side - see `useGlobalRealtime.ts`'s
 * `chatUnreadCount` handler for the live-update path, and ChatBubble.tsx's
 * initial fetch for the cold-load fallback before the first WS event
 * arrives.
 */
export function updateAppBadge(unreadConversationCount: number): void {
  if (!("setAppBadge" in navigator)) return;
  const nav = navigator as Navigator & { setAppBadge: (count?: number) => Promise<void>; clearAppBadge: () => Promise<void> };
  if (unreadConversationCount > 0) {
    nav.setAppBadge(unreadConversationCount).catch(() => {});
  } else {
    nav.clearAppBadge().catch(() => {});
  }
}
