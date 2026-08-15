import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminNotificationApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { Icon } from "../ui/Icon.js";

/**
 * Bell for server-admin-only, workspace-agnostic notifications (currently
 * just auto-update outcomes - see modules/admin/service.ts's
 * `notifyAllAdmins`). Renders nothing for a non-admin. Sibling to
 * NotificationBell.tsx (comments/mentions), which it deliberately doesn't
 * merge into - that one is per-workspace and members-only, this one is
 * instance-wide and admin-only, with a different click target (`/admin`
 * rather than an object). Pushed live over the same global `/ws/chat`
 * socket as chat (see useGlobalRealtime.ts's `adminNotification` case),
 * same as NotificationBell's per-workspace socket.
 */
export function AdminNotificationBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["adminNotifications"],
    queryFn: () => adminNotificationApi.list(),
    enabled: !!user?.isServerAdmin,
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => adminNotificationApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminNotifications"] }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => adminNotificationApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminNotifications"] }),
  });

  if (!user?.isServerAdmin) return null;

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
        title={t("nav.adminNotifications.title")}
      >
        <Icon name="shield" className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("nav.adminNotifications.title")}</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllReadMutation.mutate()} className="text-xs text-accent hover:underline">
                {t("nav.notifications.markAllRead")}
              </button>
            )}
          </div>

          {!notifications || notifications.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-muted">{t("nav.adminNotifications.empty")}</p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => {
                      if (!notification.readAt) markReadMutation.mutate(notification.id);
                      setOpen(false);
                      navigate(notification.url);
                    }}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${notification.readAt ? "" : "bg-accent/5"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {!notification.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate font-medium text-ink">{notification.title}</span>
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
