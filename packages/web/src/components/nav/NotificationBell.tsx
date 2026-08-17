import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Notification } from "@notorious/shared";
import { notificationApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";

/**
 * Bell for comment notifications (see modules/notifications/ on the server) -
 * members-only, same as the rest of this footer row (an anonymous share
 * visitor has no account for a notification to belong to). Polled via React
 * Query and pushed live over the same per-workspace WebSocket as everything
 * else (see useRealtime.ts's `notification` case) - `refetchOnWindowFocus`
 * (main.tsx's default) covers a tab that was backgrounded when the socket
 * dropped, same as every other panel in this app.
 */
export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: () => notificationApi.list(workspaceId),
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  // Also invalidates `notificationUnreadCount` - the rail's per-workspace
  // badge (see useWorkspaceUnreadCounts.ts) reads that key, not this one.
  // Marking read is a local REST call with no server-pushed WS `notification`
  // message back to this same user's socket (see useRealtime.ts's `notification`
  // case, which invalidates both keys but only ever fires for an *incoming*
  // notification), so without this the rail badge would never clear.
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(workspaceId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount", workspaceId] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount", workspaceId] });
    },
  });

  // Appends the deep-link query param ObjectDetailPage.tsx reads (`?block=`/
  // `?comment=`/`?field=` - see its own `targetBlockId`/`targetCommentId`/
  // `targetFieldKey`) matching this notification's own source, so clicking a
  // mention notification lands scrolled to the actual mention instead of just
  // the top of the object. `"comment"` (a plain reply notification, not a
  // mention) keeps the pre-existing no-query-param behavior.
  function deepLinkSuffix(notification: Notification): string {
    switch (notification.source) {
      case "mention-comment":
        return notification.commentId ? `?comment=${notification.commentId}` : "";
      case "mention-block":
        return notification.blockId ? `?block=${notification.blockId}` : "";
      case "mention-field":
        return notification.fieldKey ? `?field=${notification.fieldKey}` : "";
      default:
        return "";
    }
  }

  function notificationTitleKey(source: Notification["source"]): string {
    switch (source) {
      case "mention-comment":
        return "nav.notifications.mentionedInComment";
      case "mention-block":
      case "mention-field":
        return "nav.notifications.mentionedIn";
      default:
        return "nav.notifications.commentedOn";
    }
  }

  function handleClickNotification(notification: Notification) {
    if (!notification.readAt) markReadMutation.mutate(notification.id);
    setOpen(false);
    navigate(`/w/${workspaceId}/objects/${notification.objectId}${deepLinkSuffix(notification)}`);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
        title={t("nav.notifications.title")}
      >
        <Icon name="bell" className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("nav.notifications.title")}</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs text-accent hover:underline"
              >
                {t("nav.notifications.markAllRead")}
              </button>
            )}
          </div>

          {!notifications || notifications.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-muted">{t("nav.notifications.empty")}</p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => handleClickNotification(notification)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${notification.readAt ? "" : "bg-accent/5"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {!notification.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate font-medium text-ink">
                        {/* A subscription notification's `body` is already the fully-composed
                            sentence (translated server-side, count-aware - see
                            modules/subscriptions/service.ts's `deliverPendingSubscriptionNotification`),
                            unlike comment/mention notifications, whose `body` is just a content
                            preview meant to sit under a client-templated title line below. */}
                        {notification.source === "subscription"
                          ? notification.body
                          : t(notificationTitleKey(notification.source), { actor: notification.actorName, title: notification.objectTitle })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {notification.source === "subscription" ? notification.objectTitle : notification.body}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
