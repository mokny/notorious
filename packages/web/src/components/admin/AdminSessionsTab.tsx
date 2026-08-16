import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { Icon } from "../ui/Icon.js";
import { describeUserAgent, relativeTime } from "../../lib/deviceLabel.js";

/** Instance-wide counterpart to Settings > Security's own device list - every account's active sessions in one place, with per-session and per-user "log out everywhere" actions (see modules/admin/routes.ts). */
export function AdminSessionsTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: sessions } = useQuery({ queryKey: ["admin", "sessions"], queryFn: adminApi.listSessions });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["admin", "sessions"] });
  }

  const revokeMutation = useMutation({ mutationFn: (id: string) => adminApi.revokeSession(id), onSuccess: invalidate });
  const revokeAllMutation = useMutation({ mutationFn: (userId: string) => adminApi.revokeAllUserSessions(userId), onSuccess: invalidate });

  async function handleRevoke(session: NonNullable<typeof sessions>[number]) {
    if (session.isCurrent) {
      const ok = await confirm({
        title: t("admin.sessions.confirmSelfTitle"),
        description: t("admin.sessions.confirmSelfDescription"),
        confirmLabel: t("admin.sessions.terminate"),
        danger: true,
      });
      if (!ok) return;
    }
    revokeMutation.mutate(session.id);
  }

  async function handleRevokeAll(userId: string, userName: string) {
    const ok = await confirm({
      title: t("admin.sessions.confirmLogoutAllTitle", { name: userName }),
      description: t("admin.sessions.confirmLogoutAllDescription"),
      confirmLabel: t("admin.sessions.logoutAll"),
      danger: true,
    });
    if (!ok) return;
    revokeAllMutation.mutate(userId);
  }

  const sessionsByUser = new Map<string, NonNullable<typeof sessions>>();
  for (const session of sessions ?? []) {
    const list = sessionsByUser.get(session.userId) ?? [];
    list.push(session);
    sessionsByUser.set(session.userId, list);
  }

  return (
    <div className="space-y-4">
      {sessions?.length === 0 && <p className="text-sm text-ink-muted">{t("admin.sessions.empty")}</p>}
      {Array.from(sessionsByUser.entries()).map(([userId, userSessions]) => (
        <div key={userId} className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {userSessions[0]?.userName} {userId === me?.id && <span className="text-xs text-ink-muted">{t("admin.users.you")}</span>}
              </p>
              <p className="truncate text-xs text-ink-muted">{userSessions[0]?.userEmail}</p>
            </div>
            {userSessions.length > 0 && (
              <button
                onClick={() => handleRevokeAll(userId, userSessions[0]?.userName ?? "")}
                disabled={revokeAllMutation.isPending}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
              >
                {t("admin.sessions.logoutAll")}
              </button>
            )}
          </div>
          <div className="divide-y divide-border">
            {userSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {describeUserAgent(session.userAgent, t)}
                    {session.isCurrent && <span className="ml-2 text-xs text-accent">{t("settings.security.thisDevice")}</span>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {session.ip ?? t("settings.security.unknownIp")} · {t("settings.security.active", { time: relativeTime(session.lastSeenAt, t) })}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(session)}
                  disabled={revokeMutation.isPending}
                  className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                  title={t("admin.sessions.terminate")}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
