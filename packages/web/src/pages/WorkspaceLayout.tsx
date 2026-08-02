import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { workspaceApi, authApi, aiApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useTheme } from "../context/ThemeContext.js";
import { useRealtime } from "../lib/ws/useRealtime.js";
import { getShareToken } from "../lib/api/shareMode.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useSwipeToOpen } from "../hooks/useSwipeToOpen.js";
import { Icon } from "../components/ui/Icon.js";
import { navLinkClass } from "../components/nav/navLinkClass.js";
import { PinnedNavItem } from "../components/nav/PinnedNavItem.js";
import { RecentNavSection } from "../components/nav/RecentNavSection.js";
import { RecentlyEditedNavSection } from "../components/nav/RecentlyEditedNavSection.js";
import { ObjectTypeMenu } from "../components/nav/ObjectTypeMenu.js";

export function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, refetch } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const shareToken = getShareToken();
  // Edge-swipe from the left as an alternative to the hamburger button below
  // - `!sidebarOpen` just skips re-triggering an already-open drawer, it's
  // not gating this to mobile specifically (desktop's `md:translate-x-0`
  // already makes the drawer permanently visible regardless of this state,
  // and nothing here fires without an actual touchscreen to begin with).
  useSwipeToOpen(() => setSidebarOpen(true), !sidebarOpen);

  useRealtime(workspaceId, shareToken ?? undefined);
  const { pinnedIds, reorder } = useWorkspacePins(workspaceId);
  const pinSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

  async function handleLogout() {
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
    <div className="flex h-screen">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface-raised transition-transform duration-200 ease-in-out md:relative md:z-0 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
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
              <DndContext sensors={pinSensors} onDragEnd={handlePinDragEnd}>
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
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: user?.avatarColor }}
              >
                {user?.name?.[0]}
              </span>
              <span className="truncate text-sm">{user?.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border p-2 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
            title="Open menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-medium">{workspace?.name}</span>
        </div>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
