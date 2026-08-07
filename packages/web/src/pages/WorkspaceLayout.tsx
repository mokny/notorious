import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { workspaceApi, authApi, aiApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { useTheme } from "../context/ThemeContext.js";
import { MobileChromeProvider, useMobileChrome } from "../context/MobileChromeContext.js";
import { useRealtime } from "../lib/ws/useRealtime.js";
import { getShareToken } from "../lib/api/shareMode.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useDragSelectGuard } from "../hooks/useDragSelectGuard.js";
import { useBreakpoint, useIsLandscape } from "../hooks/useBreakpoint.js";
import { Icon } from "../components/ui/Icon.js";
import { navLinkClass } from "../components/nav/navLinkClass.js";
import { PinnedNavItem } from "../components/nav/PinnedNavItem.js";
import { InstallAppHint } from "../components/nav/InstallAppHint.js";
import { RecentNavSection } from "../components/nav/RecentNavSection.js";
import { RecentlyEditedNavSection } from "../components/nav/RecentlyEditedNavSection.js";
import { ObjectTypeMenu } from "../components/nav/ObjectTypeMenu.js";
import { NotificationBell } from "../components/nav/NotificationBell.js";
import { BottomTabBar } from "../components/nav/BottomTabBar.js";

// The mobile header's own rendered height (safe-area inset + its content) -
// exposed as a CSS var so <main>'s padding-top, the sticky action-toolbar in
// ObjectDetailPage.tsx (which sticks at that padding's inner edge for free,
// no extra offset needed), and CoverImage.tsx's negative margin (pulling
// itself back up under the header on a cover page) all agree on the same
// number without measuring anything at runtime. Kept as a plain CSS formula
// (not a ResizeObserver measurement) so it's correct on the very first paint
// - a measured value would start at 0 and jump once the effect ran. If the
// header's own padding/icon-button sizing below ever changes, update this to
// match: 0.5rem top/bottom padding (p-2) around a 32px-tall icon button
// (p-1.5 around a h-5 icon) = 48px, plus the safe-area inset itself.
const MOBILE_HEADER_HEIGHT = "calc(env(safe-area-inset-top) + 48px)";

// `useMobileChrome` (consumed below by the mobile header) is set from
// ObjectDetailPage/CoverImage.tsx, a descendant rendered through <Outlet/> -
// the provider has to wrap that too, so it lives here around the whole
// layout rather than at the route level in App.tsx.
export function WorkspaceLayout() {
  return (
    <MobileChromeProvider>
      <WorkspaceLayoutInner />
    </MobileChromeProvider>
  );
}

function WorkspaceLayoutInner() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, refetch } = useAuth();
  const { theme, toggle } = useTheme();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const shareToken = getShareToken();
  const breakpoint = useBreakpoint();
  const isLandscape = useIsLandscape();
  // Sidebar stays permanently visible (no drawer) on desktop, and on the
  // tablet tier only in landscape - tablet portrait doesn't have room for
  // sidebar + list + detail together, so it falls back to the phone-style
  // drawer there (see ObjectTypePage/SearchPage for the split-view panes
  // this pairs with).
  const sidebarPersistent = breakpoint === "desktop" || (breakpoint === "tablet" && isLandscape);
  const { coverActive } = useMobileChrome();
  // The mobile header only overlays a cover when it's actually the topmost
  // thing on screen (no persistent sidebar taking that role instead).
  const showCoverOverlay = coverActive && !sidebarPersistent;

  useRealtime(workspaceId, shareToken ?? undefined);
  const { pinnedIds, reorder } = useWorkspacePins(workspaceId);
  const pinSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const pinDragSelectGuard = useDragSelectGuard();

  function handlePinDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    reorder(String(event.active.id), String(event.over.id));
  }

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  // Only relevant for a real logged-in member (see the nav link's own
  // `!shareToken` check below) - skipped for an anonymous share visitor,
  // whose session can't call this endpoint anyway.
  const { data: aiConfig } = useQuery({
    queryKey: ["aiConfig"],
    queryFn: aiApi.getConfig,
    enabled: !shareToken,
    staleTime: 60_000,
  });

  // Close the mobile drawer whenever the route changes (desktop ignores this,
  // since the sidebar there is always visible regardless of this state).
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  // Scroll back to the top on every page change - `<main>` below is the
  // actual scrolling element (not the window/body), so the browser's own
  // scroll-restoration-on-navigate never kicks in for it: without this,
  // opening a new object while scrolled halfway down the previous one left
  // it starting at that same scroll position instead of at the top.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  async function handleLogout() {
    const confirmed = await confirm({
      title: "Log out?",
      description: "You'll be signed out of this device.",
      confirmLabel: "Log out",
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

  return (
    // `h-dvh`, not `h-screen` (`100vh`) - iOS/Android shrink the *dynamic*
    // viewport when the on-screen keyboard opens, but leave the plain
    // layout viewport (what `100vh` measures) unchanged. With `h-screen`
    // the bottom tab bar and sidebar footer would get pushed down behind
    // the keyboard instead of reflowing above it.
    <div className="flex h-dvh">
      {sidebarOpen && !sidebarPersistent && (
        <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface-raised transition-transform duration-200 ease-in-out ${
          sidebarPersistent ? "relative z-0 translate-x-0" : sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {shareToken ? (
          <div className="flex items-center gap-2 border-b border-border px-4 py-4">
            <Icon name={workspace?.icon ?? "sparkles"} className="h-5 w-5 text-accent" />
            <span className="truncate font-medium">{workspace?.name ?? "Loading…"}</span>
            <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted">Shared</span>
          </div>
        ) : (
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 border-b border-border px-4 py-4 text-left hover:bg-surface"
          >
            <Icon name={workspace?.icon ?? "sparkles"} className="h-5 w-5 text-accent" />
            <span className="truncate font-medium">{workspace?.name ?? "Loading…"}</span>
          </button>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {workspace?.dashboardObjectId && (
            <NavLink to={`/w/${workspaceId}/objects/${workspace.dashboardObjectId}`} className={({ isActive }) => navLinkClass(isActive)}>
              <Icon name="layout-dashboard" className="h-4 w-4" /> Dashboard
            </NavLink>
          )}
          <ObjectTypeMenu workspaceId={workspaceId!} />
          <NavLink to={`/w/${workspaceId}/search`} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon name="search" className="h-4 w-4" /> Search
          </NavLink>
          {!shareToken && aiConfig?.configured && (
            <NavLink to={`/w/${workspaceId}/chat`} className={({ isActive }) => navLinkClass(isActive)}>
              <Icon name="bot" className="h-4 w-4" /> Agent Chat
            </NavLink>
          )}

          {pinnedIds.length > 0 && (
            <div className="mt-3">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Pinned</p>
              <DndContext
                sensors={pinSensors}
                onDragStart={pinDragSelectGuard.onDragStart}
                onDragCancel={pinDragSelectGuard.onDragCancel}
                onDragEnd={(event) => {
                  pinDragSelectGuard.onDragEnd();
                  handlePinDragEnd(event);
                }}
              >
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {pinnedIds.map((objectId) => (
                      <PinnedNavItem key={objectId} workspaceId={workspaceId!} objectId={objectId} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <RecentNavSection workspaceId={workspaceId!} />
          {/* "Recently edited BY ME" doesn't apply to an anonymous visitor,
              and its endpoint isn't share-aware server-side. */}
          {!shareToken && <RecentlyEditedNavSection workspaceId={workspaceId!} />}

          {!shareToken && (
            <div className="mt-3 border-t border-border pt-2">
              <NavLink to={`/w/${workspaceId}/settings`} className={({ isActive }) => navLinkClass(isActive)}>
                <Icon name="settings" className="h-4 w-4" /> Settings
              </NavLink>
            </div>
          )}
        </nav>

        <div className="flex items-center justify-between border-t border-border p-3">
          {shareToken ? (
            <span className="truncate text-sm text-ink-muted">Viewing via a shared link</span>
          ) : (
            <div className="flex items-center gap-2 overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: user?.avatarColor }}
                >
                  {user?.name?.[0]}
                </span>
              )}
              <span className="truncate text-sm">{user?.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {!shareToken && workspaceId && <NotificationBell workspaceId={workspaceId} />}
            <button onClick={toggle} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="Toggle theme">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            {!shareToken && (
              <button onClick={handleLogout} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="Log out">
                <Icon name="close" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div
        className="relative flex min-w-0 flex-1 flex-col"
        style={!sidebarPersistent ? ({ "--mobile-header-h": MOBILE_HEADER_HEIGHT } as CSSProperties) : undefined}
      >
        {!sidebarPersistent && (
          // Always floats above <main> (never takes flow space itself) -
          // <main>'s own padding-top below compensates instead, which also
          // makes the action-toolbar sticky bar in ObjectDetailPage.tsx stick
          // right at that padding's inner edge (i.e. right below this bar)
          // for free, with no extra offset math needed there. A permanent
          // (not scroll-dependent, to avoid a jump-cut once it would
          // otherwise toggle) dark scrim keeps the icon/text legible over a
          // cover image; solid bg-surface otherwise.
          <div
            className={`absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-2 ${
              showCoverOverlay ? "bg-gradient-to-b from-black/60 to-transparent" : "border-b border-border bg-surface"
            }`}
            style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className={`rounded-md p-1.5 hover:bg-surface-raised ${
                showCoverOverlay ? "text-white hover:text-white" : "text-ink-muted hover:text-ink"
              }`}
              title="Open menu"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <span className={`truncate text-sm font-medium ${showCoverOverlay ? "text-white" : ""}`}>{workspace?.name}</span>
          </div>
        )}
        {/* Only for a real member - an anonymous share visitor has no
            account to "install their copy" of the app for. Hidden while a
            cover is full-bleed under the overlay header (see showCoverOverlay
            above) - it's in main's normal flow, so left up it would push the
            cover down and break the "content reaches the very top" effect on
            its first (undismissed) showing. */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" style={!sidebarPersistent ? { paddingTop: "var(--mobile-header-h)" } : undefined}>
          {!shareToken && !showCoverOverlay && <InstallAppHint />}
          <Outlet />
        </main>
        {breakpoint === "phone" && (
          <BottomTabBar
            workspaceId={workspaceId!}
            dashboardObjectId={workspace?.dashboardObjectId ?? undefined}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        )}
      </div>
    </div>
  );
}
