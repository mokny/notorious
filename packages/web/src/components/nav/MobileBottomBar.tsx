import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import { schemaApi, objectApi, workspaceApi } from "../../lib/api/resources.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { reloadIfViewportShrunk, resetViewportReloadCount } from "../../hooks/useDynamicViewportHeight.js";
import { useAuth } from "../../context/AuthContext.js";
import { useSearchOverlay } from "../../context/SearchOverlayContext.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "./IOSMenu.js";
import { Icon } from "../ui/Icon.js";

/**
 * Floating pill-shaped bottom toolbar shown only on the phone breakpoint -
 * replaces the old flat 5-tab BottomTabBar.tsx (Home/Search/New/Menu/
 * Settings). Down to 3 actions (search, home, new object), plus a 4th
 * leftmost lock toggle whenever an object is actually open - moved here
 * from ObjectDetailPage.tsx's sticky action-toolbar, which hides its own
 * copy on phone (`hidden md:*`) so it isn't duplicated. Settings and
 * sidebar/menu access live in MobileTopBar.tsx's "…" overflow menu instead,
 * see that component's own doc comment.
 */
export function MobileBottomBar({ workspaceId, dashboardObjectId }: { workspaceId: string; dashboardObjectId?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const shareToken = isSharedSession();
  const { user } = useAuth();
  const { open: openSearch } = useSearchOverlay();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const prevWorkspaceIdRef = useRef(workspaceId);

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

  // Same iOS-viewport-shrink workaround as the old BottomTabBar - see its
  // own comment for why this needs to live wherever the phone-only bottom
  // chrome is rendered, and re-run per workspace switch.
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== workspaceId) {
      resetViewportReloadCount();
      prevWorkspaceIdRef.current = workspaceId;
    }
    reloadIfViewportShrunk();
  }, [workspaceId]);

  const homePath = dashboardObjectId ? `/w/${workspaceId}/objects/${dashboardObjectId}` : `/w/${workspaceId}`;
  const isHome = location.pathname === homePath;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center md:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
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
              title={isLocked ? "Unlock this object" : "Lock this object against edits"}
            >
              <Icon name={isLocked ? "lock" : "unlock"} className="h-5 w-5" />
            </button>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center text-red-500" title="This object is locked against edits">
              <Icon name="lock" className="h-5 w-5" />
            </span>
          ))}

        <button
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
          title="Search"
        >
          <Icon name="search" className="h-5 w-5" />
        </button>

        <button
          onClick={() => navigate(homePath)}
          className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface ${isHome ? "text-accent" : "text-ink-muted hover:text-ink"}`}
          title="Home"
        >
          <Icon name="layout-dashboard" className="h-5 w-5" />
        </button>

        {!shareToken && (
          <div className="relative">
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
              title="New object"
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
      </div>
    </nav>
  );
}
