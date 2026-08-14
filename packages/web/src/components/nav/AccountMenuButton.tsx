import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChatStatus } from "@notorious/shared";
import { authApi, chatApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { useRobustImage } from "../../hooks/useRobustImage.js";
import { isStandalone } from "../../lib/platform.js";
import { Icon } from "../ui/Icon.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "./IOSMenu.js";

const STATUS_OPTIONS: { status: ChatStatus; color: string }[] = [
  { status: "green", color: "#22c55e" },
  { status: "yellow", color: "#eab308" },
  { status: "red", color: "#ef4444" },
];

interface AccountMenuButtonProps {
  workspaceId: string;
  /** "full" (avatar + name, sidebar footer) or "compact" (avatar only, WorkspaceRail). */
  variant: "full" | "compact";
  side?: "top" | "bottom";
}

/**
 * The account/avatar button + its dropdown menu - shared by WorkspaceLayout's
 * sidebar footer (mobile/tablet, and desktop when no WorkspaceRail is shown)
 * and WorkspaceRail (desktop), so both trigger points stay in sync instead of
 * carrying their own copies of the menu items and logout flow.
 */
export function AccountMenuButton({ workspaceId, variant, side = "top" }: AccountMenuButtonProps) {
  const { t } = useTranslation();
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const avatarImage = useRobustImage(user?.avatarUrl ?? null);
  const isPWA = isStandalone();

  const statusMutation = useMutation({
    mutationFn: (status: ChatStatus) => chatApi.updateStatus(status),
    onMutate: async (status) => {
      queryClient.setQueryData(["me"], (prev: typeof user) => (prev ? { ...prev, chatStatus: status } : prev));
    },
  });

  async function handleLogout() {
    const confirmed = await confirm({
      title: t("nav.logOutConfirmTitle"),
      description: t("nav.logOutConfirmDescription"),
      confirmLabel: t("nav.logOut"),
    });
    if (!confirmed) return;
    await authApi.logout();
    // Without this, `user` in AuthContext stays the stale cached value from
    // before logout - LoginPage immediately bounces back to "/" if it still
    // sees a (stale) logged-in user, and WorkspacePickerPage then renders
    // near-empty since its own queries now 401. Awaiting the refetch first
    // guarantees LoginPage sees `user: null` on its very first render.
    await refetch();
    navigate("/login", { replace: true });
  }

  const statusColor = STATUS_OPTIONS.find((o) => o.status === user?.chatStatus)?.color ?? "#22c55e";
  const statusDot = !isPWA && user && (
    <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full ring-2 ring-surface" style={{ backgroundColor: statusColor }} />
  );

  const avatar = isPWA ? (
    <Icon name="settings" className="h-5 w-5 shrink-0 text-ink-muted" />
  ) : user?.avatarUrl && !avatarImage.failed ? (
    <span className="relative inline-flex h-7 w-7 shrink-0">
      <img src={avatarImage.src} onError={avatarImage.onError} alt="" className="h-full w-full rounded-full object-cover" />
      {statusDot}
    </span>
  ) : (
    <span className="relative inline-flex h-7 w-7 shrink-0">
      <span
        className="flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: user?.avatarColor }}
      >
        {user?.name?.[0]}
      </span>
      {statusDot}
    </span>
  );

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "full"
            ? "flex items-center gap-2 overflow-hidden rounded-lg p-1 -m-1 text-left hover:bg-surface"
            : "flex items-center justify-center rounded-full hover:opacity-80"
        }
        title={t("nav.account")}
      >
        {avatar}
        {variant === "full" && <span className="truncate text-sm">{isPWA ? t("nav.settingsLabel") : user?.name}</span>}
      </button>
      <IOSMenu open={open} onClose={() => setOpen(false)} side={side} align="start" widthClassName="w-56">
        {!isPWA && user && (
          <IOSMenuGroup>
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.status}
                onClick={() => {
                  setOpen(false);
                  statusMutation.mutate(option.status);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-ink active:bg-surface"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                <span className="min-w-0 flex-1 truncate">{t(`nav.chatStatus.${option.status}`)}</span>
                {user.chatStatus === option.status && <Icon name="check" className="h-4 w-4 shrink-0 text-ink-muted" />}
              </button>
            ))}
          </IOSMenuGroup>
        )}
        <IOSMenuGroup>
          <IOSMenuItem
            icon="board"
            label={t("nav.switchWorkspace")}
            onClick={() => {
              setOpen(false);
              navigate("/workspaces");
            }}
          />
          <IOSMenuItem
            icon="settings"
            label={t("nav.workspaceSettings")}
            onClick={() => {
              setOpen(false);
              navigate(`/w/${workspaceId}/settings`);
            }}
          />
          <IOSMenuItem
            icon="user"
            label={t("nav.accountSettings")}
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          />
          {user?.isServerAdmin && (
            <IOSMenuItem
              icon="shield"
              label={t("nav.serverAdmin")}
              onClick={() => {
                setOpen(false);
                navigate("/admin");
              }}
            />
          )}
          <IOSMenuItem
            icon="close"
            label={t("nav.logOut")}
            destructive
            onClick={() => {
              setOpen(false);
              void handleLogout();
            }}
          />
        </IOSMenuGroup>
      </IOSMenu>
    </div>
  );
}
