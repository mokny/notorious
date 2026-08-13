import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import { schemaApi, objectApi, workspaceApi, chatApi } from "../../lib/api/resources.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { useKeyboardInset } from "../../hooks/useKeyboardInset.js";
import { useAuth } from "../../context/AuthContext.js";
import { useSearchOverlay } from "../../context/SearchOverlayContext.js";
import { useChatOverlay } from "../../context/ChatOverlayContext.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "./IOSMenu.js";
import { Icon } from "../ui/Icon.js";

/**
 * Floating pill-shaped bottom toolbar shown only on the phone breakpoint -
 * replaces the old flat 5-tab BottomTabBar.tsx (Home/Search/New/Menu/
 * Settings). Down to 3 actions (search, home, new object), plus a 4th
 * leftmost lock toggle whenever an object is actually open - moved here
 * from ObjectDetailPage.tsx's sticky action-toolbar, which hides its own
 * copy on phone (`hidden md:*`) so it isn't duplicated. Settings access
 * lives in MobileTopBar.tsx's "…" overflow menu instead, see that
 * component's own doc comment.
 */
export function MobileBottomBar({ workspaceId, dashboardObjectId }: { workspaceId: string; dashboardObjectId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const shareToken = isSharedSession();
  const { user } = useAuth();
  const { open: openSearch } = useSearchOverlay();
  const { open: openChat } = useChatOverlay();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const keyboardInset = useKeyboardInset();

  // Same "parse it off the URL" approach as MobileTopBar.tsx - this is a
  // layout-level component too, so useParams() here wouldn't see a nested
  // route's :objectId.
  const routeObjectId = location.pathname.match(/\/objects\/([^/]+)/)?.[1];

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
  // Reuses the same ["chatConversations"] cache key ChatRealtimeContext keeps
  // live via /ws/chat, so this is just a read - no extra polling of its own.
  const { data: chatConversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations, enabled: !shareToken });
  const chatUnreadCount = chatConversations?.filter((c) => c.unreadCount > 0).length ?? 0;

  const isOwner = Boolean(user && workspace && workspace.ownerId === user.id);
  const isLocked = Boolean(object?.lockedAt);
  // Same visibility rule as the sticky toolbar's own version of this button
  // (ObjectDetailPage.tsx): the owner always gets the toggle, anyone else
  // only sees it (as a plain indicator, not a button) while it's locked.
  const showLock = Boolean(routeObjectId && object && !shareToken && (isOwner || isLocked));

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => objectApi.setLocked(routeObjectId!, { locked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", routeObjectId] }),
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
    enabled: newMenuOpen,
  });

  const createObjectMutation = useMutation({
    mutationFn: (objectTypeId: string) => objectApi.create(workspaceId, { objectTypeId, title: "Untitled", values: {} }),
    onSuccess: (object) => {
      setNewMenuOpen(false);
      navigate(`/w/${workspaceId}/objects/${object.id}`);
    },
  });

  const homePath = dashboardObjectId ? `/w/${workspaceId}/objects/${dashboardObjectId}` : `/w/${workspaceId}`;
  const isHome = location.pathname === homePath;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-center md:hidden"
      // `bottom: keyboardInset` (not a plain `bottom-0`) - lifts the bar
      // above the on-screen keyboard instead of relying on `position: fixed`
      // staying pinned to a shrinking layout viewport, which iOS/WKWebView
      // doesn't reliably do. See useKeyboardInset's own doc comment.
      style={{ bottom: keyboardInset.bottom, paddingBottom: "1rem" }}
    >
      {/* `relative` + a separate `-z-10` background layer for the pill's
          border/blur/shadow, instead of putting `backdrop-blur` directly on
          this flex container - `backdrop-filter` (like `transform`/`filter`)
          establishes a new containing block for any `position: fixed`
          descendant, which would otherwise make IOSMenu's full-screen
          backdrop below (a `fixed inset-0` div) size itself to *this pill*
          instead of the viewport - shrinking its tap-outside-to-close area
          down to just this ~50px-tall bar instead of the whole screen. */}
      <div className="pointer-events-auto relative flex items-center gap-1 p-1.5">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full border border-border bg-surface-raised/95 shadow-lg backdrop-blur" />
        {showLock &&
          (isOwner ? (
            <button
              onClick={() => lockMutation.mutate(!isLocked)}
              disabled={lockMutation.isPending}
              className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface disabled:opacity-50 ${isLocked ? "text-red-500" : "text-ink-muted hover:text-ink"}`}
              title={isLocked ? t("nav.mobile.unlockObject") : t("nav.mobile.lockObject")}
            >
              <Icon name={isLocked ? "lock" : "unlock"} className="h-5 w-5" />
            </button>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center text-red-500" title={t("nav.mobile.objectLocked")}>
              <Icon name="lock" className="h-5 w-5" />
            </span>
          ))}

        <button
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
          title={t("nav.mobile.search")}
        >
          <Icon name="search" className="h-5 w-5" />
        </button>

        <button
          onClick={() => navigate(homePath)}
          className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface ${isHome ? "text-accent" : "text-ink-muted hover:text-ink"}`}
          title={t("nav.mobile.home")}
        >
          <Icon name="layout-dashboard" className="h-5 w-5" />
        </button>

        {!shareToken && (
          <div className="relative">
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
              title={t("nav.mobile.newObject")}
            >
              <Icon name="pencil" className="h-5 w-5" />
            </button>

            <IOSMenu open={newMenuOpen} onClose={() => setNewMenuOpen(false)} side="top" widthClassName="w-52 max-h-72 overflow-y-auto">
              {objectTypes && (
                <IOSMenuGroup>
                  {sortObjectTypesForDisplay(objectTypes).map((type) => (
                    <IOSMenuItem key={type.id} icon={type.icon} label={type.name} onClick={() => createObjectMutation.mutate(type.id)} />
                  ))}
                </IOSMenuGroup>
              )}
            </IOSMenu>
          </div>
        )}

        {!shareToken && (
          <button
            onClick={() => openChat()}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
            title={t("nav.mobile.chats")}
          >
            <Icon name="comment" className="h-5 w-5" />
            {chatUnreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
          </button>
        )}
      </div>
    </nav>
  );
}
