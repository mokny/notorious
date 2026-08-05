import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: () => notificationApi.list(workspaceId),
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(workspaceId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] }),
  });

  function handleClickNotification(id: string, objectId: string, alreadyRead: boolean) {
    if (!alreadyRead) markReadMutation.mutate(id);
    setOpen(false);
    navigate(`/w/${workspaceId}/objects/${objectId}`);
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
        title="Notifications"
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
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {!notifications || notifications.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-muted">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => handleClickNotification(notification.id, notification.objectId, Boolean(notification.readAt))}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${notification.readAt ? "" : "bg-accent/5"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {!notification.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate font-medium text-ink">
                        {notification.actorName} commented on "{notification.objectTitle}"
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{notification.body}</p>
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
