import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authApi, objectApi, schemaApi, workspaceApi } from "../../lib/api/resources.js";
import { useObjectHistory } from "../../context/ObjectHistoryContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { useDeleteObject } from "../../hooks/useDeleteObject.js";
import { useWorkspacePins } from "../../hooks/useWorkspacePins.js";
import { useMobileChrome } from "../../context/MobileChromeContext.js";
import { useAuth } from "../../context/AuthContext.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { ShareDialog } from "../ShareDialog.js";
import { ExportMenu } from "../ExportMenu.js";
import { ObjectSlugButton } from "../ObjectSlugButton.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "./IOSMenu.js";
import { Icon } from "../ui/Icon.js";

interface MobileTopBarProps {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  dashboardObjectId?: string;
}

/**
 * Floating pill-shaped top header, phone breakpoint only - replaces the
 * "no header at all" phone previously had (see WorkspaceLayout.tsx's
 * `showMobileHeader`, which always excluded `isPhone`). Three parts, all
 * separate floating pills rather than one continuous bar (matches the
 * reference iOS-style app the user asked to match): a back button, a
 * title pill (current object's icon+title, or the workspace's own if
 * there isn't one - tap opens the visited-objects breadcrumb, see
 * ObjectHistoryContext.tsx), and a "…" overflow menu. That menu now
 * carries *every* action ObjectDetailPage.tsx's sticky in-page toolbar
 * used to show on phone (that toolbar is `hidden md:flex` there now,
 * lock excepted - see MobileBottomBar.tsx) plus app-level navigation
 * (home, settings, refresh) that used to live in the old flat BottomTabBar.
 * Styled as a native-iOS-context-menu (IOSMenu.tsx).
 */
export function MobileTopBar({ workspaceId, workspaceName, workspaceIcon, dashboardObjectId }: MobileTopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, refetch } = useAuth();
  const { entries, current, goBack, jumpTo } = useObjectHistory();
  const { sectionsVisible, setSectionsVisible } = useMobileChrome();
  const { theme, toggle: toggleTheme } = useTheme();
  const confirm = useConfirm();
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The route itself doesn't expose params to a layout-level component like
  // this one (useParams() only sees params matched up to where it's
  // rendered, not a nested route's) - parsed from the URL instead. Good
  // enough here: only used to gate the object-actions section of the "…"
  // menu below, not to fetch anything.
  const routeObjectMatch = location.pathname.match(/\/objects\/([^/]+)/);
  const routeObjectId = routeObjectMatch?.[1];
  const onObjectPage = Boolean(routeObjectId) && current?.id === routeObjectId;
  const shareToken = isSharedSession();

  const { data: object } = useQuery({
    queryKey: ["object", routeObjectId],
    queryFn: () => objectApi.get(routeObjectId!),
    enabled: Boolean(routeObjectId),
  });
  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId),
    enabled: Boolean(routeObjectId),
  });
  const { data: dashboardObject } = useQuery({
    queryKey: ["object", dashboardObjectId],
    queryFn: () => objectApi.get(dashboardObjectId!),
    enabled: Boolean(dashboardObjectId),
  });
  // Only needed to figure out where `goHome()` lands when there's no
  // dashboard object set, so `handleBack` can tell whether it's already
  // there (see homePath below).
  const { data: homeObjectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
    enabled: !dashboardObjectId,
  });
  const isOwner = Boolean(user && workspace && workspace.ownerId === user.id);
  const isLocked = Boolean(object?.lockedAt);
  const { isPinned, toggle: togglePin } = useWorkspacePins(workspaceId);
  const pinned = object ? isPinned(object.id) : false;
  const isDashboard = workspace?.dashboardObjectId === object?.id;

  const dashboardMutation = useMutation({
    mutationFn: (nextDashboardObjectId: string | null) => workspaceApi.update(workspaceId, { dashboardObjectId: nextDashboardObjectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });
  const commentsDisabledMutation = useMutation({
    mutationFn: (disabled: boolean) => objectApi.setCommentsDisabled(routeObjectId!, { disabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", routeObjectId] }),
  });
  const requiresReverifyMutation = useMutation({
    mutationFn: (requiresReverify: boolean) => objectApi.setRequiresReverify(routeObjectId!, { requiresReverify }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", routeObjectId] }),
  });

  // Mirrors ObjectDetailPage.tsx's identical handler (desktop toolbar shield toggle) - same
  // confirm copy, same mutation - just reachable from the "…" menu instead on phone.
  async function handleToggleRequiresReverify(nextValue: boolean) {
    const ok = await confirm(
      nextValue
        ? {
            title: t("nav.mobile.requireReverifyConfirmTitle"),
            description: t("nav.mobile.requireReverifyConfirmDescription"),
            confirmLabel: t("nav.mobile.requireReverifyConfirmLabel"),
          }
        : {
            title: t("nav.mobile.removeReverifyConfirmTitle"),
            description: t("nav.mobile.removeReverifyConfirmDescription"),
            confirmLabel: t("nav.mobile.removeReverifyConfirmLabel"),
            danger: true,
          },
    );
    if (ok) requiresReverifyMutation.mutate(nextValue);
  }

  const { deleteObject } = useDeleteObject(workspaceId, onObjectPage ? routeObjectId : undefined);

  const title = onObjectPage && current ? current.title || t("nav.untitled") : workspaceName;
  const icon = onObjectPage && current ? current.icon ?? "file-text" : workspaceIcon;
  // The dashboard object is already shown as its own pinned row above (see
  // the `dashboardObjectId &&` block below) - filtered back out here so it
  // doesn't also show up a second time whenever it's the current object or
  // anywhere else in the visited-history stack.
  const historyEntries = [...entries].reverse().filter((entry) => entry.id !== dashboardObjectId);

  function goHome() {
    navigate(dashboardObjectId ? `/w/${workspaceId}/objects/${dashboardObjectId}` : `/w/${workspaceId}`);
  }

  async function handleLogout() {
    const confirmed = await confirm({
      title: t("nav.logOutConfirmTitle"),
      description: t("nav.logOutConfirmDescription"),
      confirmLabel: t("nav.logOut"),
    });
    if (!confirmed) return;
    await authApi.logout();
    await refetch();
    navigate("/login", { replace: true });
  }

  // Mirrors WorkspaceHome.tsx's own redirect target, so handleBack can tell
  // whether we're already home (in which case the next back press should go
  // to workspace selection rather than bounce in place).
  const homePath = (() => {
    if (dashboardObjectId) return `/w/${workspaceId}/objects/${dashboardObjectId}`;
    if (!homeObjectTypes) return null;
    const defaultType = homeObjectTypes.find((t) => t.key === "task") ?? homeObjectTypes[0];
    return defaultType ? `/w/${workspaceId}/types/${defaultType.key}` : `/w/${workspaceId}/search`;
  })();
  const isAtHome = homePath !== null && location.pathname === homePath;

  function handleBack() {
    const prevId = goBack();
    if (prevId) {
      navigate(`/w/${workspaceId}/objects/${prevId}`);
      return;
    }
    if (shareToken) {
      goHome();
      return;
    }
    if (isAtHome) {
      navigate("/workspaces");
      return;
    }
    goHome();
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center gap-2 px-2 md:hidden"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      <button
        onClick={handleBack}
        className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised/95 shadow-lg backdrop-blur"
        title={t("nav.mobile.back")}
      >
        <Icon name="chevron-left" className="h-5 w-5" />
      </button>

      <div className="pointer-events-auto relative min-w-0 flex-1">
        <button
          onClick={() => setBreadcrumbOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-raised/95 px-3 py-2 text-left shadow-lg backdrop-blur"
        >
          <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        </button>

        <IOSMenu open={breadcrumbOpen} onClose={() => setBreadcrumbOpen(false)} align="start" widthClassName="w-64 max-h-72 overflow-y-auto">
          {dashboardObjectId && (
            <IOSMenuGroup>
              <IOSMenuItem
                icon={dashboardObject?.icon ?? "layout-dashboard"}
                label={dashboardObject?.title || t("nav.dashboard")}
                onClick={() => {
                  jumpTo(dashboardObjectId);
                  navigate(`/w/${workspaceId}/objects/${dashboardObjectId}`);
                  setBreadcrumbOpen(false);
                }}
              />
            </IOSMenuGroup>
          )}
          {historyEntries.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">{t("nav.mobile.noHistory")}</p>
          ) : (
            <IOSMenuGroup>
              {historyEntries.map((entry) => (
                <IOSMenuItem
                  key={entry.id}
                  icon={entry.icon ?? "file-text"}
                  label={entry.title || t("nav.untitled")}
                  onClick={() => {
                    jumpTo(entry.id);
                    navigate(`/w/${workspaceId}/objects/${entry.id}`);
                    setBreadcrumbOpen(false);
                  }}
                />
              ))}
            </IOSMenuGroup>
          )}
          <IOSMenuGroup>
            <IOSMenuItem
              icon="board"
              label={t("nav.switchWorkspace")}
              onClick={() => {
                setBreadcrumbOpen(false);
                navigate("/workspaces");
              }}
            />
          </IOSMenuGroup>
        </IOSMenu>
      </div>

      <div className="pointer-events-auto relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-raised/95 shadow-lg backdrop-blur"
          title={t("nav.mobile.more")}
        >
          <Icon name="more" className="h-5 w-5" />
        </button>

        <IOSMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
          {onObjectPage && object && !shareToken && isOwner && (
            <IOSMenuGroup>
              <IOSMenuItem
                icon="shield"
                label={object.requiresReverify ? t("nav.mobile.disableReverify") : t("nav.mobile.requireReverify")}
                onClick={() => {
                  setMenuOpen(false);
                  void handleToggleRequiresReverify(!object.requiresReverify);
                }}
              />
            </IOSMenuGroup>
          )}
          {onObjectPage && object && (
            <IOSMenuGroup>
              <IOSMenuItem
                icon="eye"
                label={sectionsVisible ? t("nav.mobile.hideDetails") : t("nav.mobile.showDetails")}
                onClick={() => {
                  setSectionsVisible(!sectionsVisible);
                  setMenuOpen(false);
                }}
              />
              <ExportMenu variant="menuItem" workspaceId={workspaceId} objectId={object.id} title={title} />
              {!shareToken && (
                <>
                  <ObjectSlugButton variant="menuItem" objectId={object.id} slug={object.slug} disabled={isLocked} />
                  <IOSMenuItem
                    icon={pinned ? "pin-off" : "pin"}
                    label={pinned ? t("nav.mobile.unpinFromSidebar") : t("nav.mobile.pinToSidebar")}
                    onClick={() => {
                      togglePin(object.id);
                      setMenuOpen(false);
                    }}
                  />
                  <IOSMenuItem
                    icon="layout-dashboard"
                    label={isDashboard ? t("nav.mobile.removeAsDashboard") : t("nav.mobile.setAsDashboard")}
                    onClick={() => {
                      dashboardMutation.mutate(isDashboard ? null : object.id);
                      setMenuOpen(false);
                    }}
                  />
                  {isOwner && (
                    <IOSMenuItem
                      icon={object.commentsDisabled ? "comment-off" : "comment"}
                      label={object.commentsDisabled ? t("nav.mobile.enableComments") : t("nav.mobile.disableComments")}
                      onClick={() => {
                        commentsDisabledMutation.mutate(!object.commentsDisabled);
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  <ShareDialog variant="menuItem" workspaceId={workspaceId} objectId={object.id} label={t("nav.mobile.share")} />
                  <IOSMenuItem
                    icon="trash"
                    label={t("nav.mobile.delete")}
                    destructive
                    disabled={isLocked}
                    onClick={() => {
                      setMenuOpen(false);
                      void deleteObject(title);
                    }}
                  />
                </>
              )}
            </IOSMenuGroup>
          )}

          <IOSMenuGroup>
            <IOSMenuItem
              icon="layout-dashboard"
              label={t("nav.mobile.home")}
              onClick={() => {
                setMenuOpen(false);
                goHome();
              }}
            />
            {!shareToken && (
              <>
                <IOSMenuItem
                  icon="board"
                  label={t("nav.switchWorkspace")}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/workspaces");
                  }}
                />
                <IOSMenuItem
                  icon="user"
                  label={t("nav.accountSettings")}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                />
                <IOSMenuItem
                  icon="settings"
                  label={t("nav.workspaceSettings")}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/w/${workspaceId}/settings`);
                  }}
                />
              </>
            )}
            <IOSMenuItem
              icon={theme === "dark" ? "sun" : "moon"}
              label={theme === "dark" ? t("nav.mobile.lightMode") : t("nav.mobile.darkMode")}
              onClick={() => {
                setMenuOpen(false);
                toggleTheme();
              }}
            />
            <IOSMenuItem icon="refresh" label={t("nav.mobile.refresh")} onClick={() => window.location.reload()} />
            {!shareToken && (
              <IOSMenuItem
                icon="close"
                label={t("nav.logOut")}
                destructive
                onClick={() => {
                  setMenuOpen(false);
                  void handleLogout();
                }}
              />
            )}
          </IOSMenuGroup>
        </IOSMenu>
      </div>
    </div>
  );
}
