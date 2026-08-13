import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { workspaceApi, authApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { useTheme } from "../context/ThemeContext.js";
import { MobileChromeProvider, useMobileChrome } from "../context/MobileChromeContext.js";
import { ObjectHistoryProvider } from "../context/ObjectHistoryContext.js";
import { SearchOverlayProvider } from "../context/SearchOverlayContext.js";
import { useRealtime } from "../lib/ws/useRealtime.js";
import { getShareToken } from "../lib/api/shareMode.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useRobustImage } from "../hooks/useRobustImage.js";
import { useDragSelectGuard } from "../hooks/useDragSelectGuard.js";
import { useBreakpoint, useIsLandscape } from "../hooks/useBreakpoint.js";
import { isStandalone } from "../lib/platform.js";
import { Icon } from "../components/ui/Icon.js";
import { navLinkClass } from "../components/nav/navLinkClass.js";
import { PinnedNavItem } from "../components/nav/PinnedNavItem.js";
import { InstallAppHint } from "../components/nav/InstallAppHint.js";
import { PushNotificationBanner } from "../components/nav/PushNotificationBanner.js";
import { RecentNavSection } from "../components/nav/RecentNavSection.js";
import { RecentlyEditedNavSection } from "../components/nav/RecentlyEditedNavSection.js";
import { ObjectTypeMenu } from "../components/nav/ObjectTypeMenu.js";
import { NotificationBell } from "../components/nav/NotificationBell.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "../components/nav/IOSMenu.js";
import { MobileTopBar } from "../components/nav/MobileTopBar.js";
import { MobileBottomBar } from "../components/nav/MobileBottomBar.js";
import { SearchSheet } from "../components/search/SearchSheet.js";

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

// BottomTabBar's own rendered height (its fixed 52px row + the safe-area
// inset it pads itself with - see BottomTabBar.tsx) - exposed as a CSS var
// so <main>'s padding-bottom reserves exactly the space the (now
// `position: fixed`) tab bar covers, keeping scrolled-to-bottom content from
// ending up hidden underneath it. Update the 52px here if BottomTabBar's own
// row height ever changes.
// The phone breakpoint's floating pill header/toolbar (MobileTopBar.tsx,
// MobileBottomBar.tsx) - both `position: fixed` overlays, not part of the
// normal flex flow, so <main>'s own padding reserves the matching space the
// same way it does for MOBILE_HEADER_HEIGHT above. Numbers derived from each
// component's own sizing (pill button height + its container padding) -
// update these if that sizing ever changes.
const MOBILE_TOP_BAR_HEIGHT = "calc(env(safe-area-inset-top) + 3.5rem)";
// 3.5rem pill height + a fixed 1rem of breathing room above the true bottom
// edge - env(safe-area-inset-bottom) is always 0 without viewport-fit=cover
// (see index.html), so a plain rem value is what actually lifts the pill now
// (matches MobileBottomBar.tsx's own paddingBottom below).
const MOBILE_BOTTOM_BAR_HEIGHT = "calc(3.5rem + 1rem)";

// `useMobileChrome` (consumed below by the mobile header) is set from
// ObjectDetailPage/CoverImage.tsx, a descendant rendered through <Outlet/> -
// the provider has to wrap that too, so it lives here around the whole
// layout rather than at the route level in App.tsx.
export function WorkspaceLayout() {
  return (
    <MobileChromeProvider>
      <ObjectHistoryProvider>
        <SearchOverlayProvider>
          <WorkspaceLayoutInner />
        </SearchOverlayProvider>
      </ObjectHistoryProvider>
    </MobileChromeProvider>
  );
}

function WorkspaceLayoutInner() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, refetch } = useAuth();
  const { theme, toggle } = useTheme();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const sidebarAvatarImage = useRobustImage(user?.avatarUrl ?? null);
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
  // Phone drops the top bar entirely - BottomTabBar's own "Menu" button
  // (rendered further down, phone-only) is the sole way to reach the
  // sidebar there. Tablet-portrait has no bottom tab bar of its own, so it
  // keeps this header as its only nav entry point.
  const isPhone = breakpoint === "phone";
  const showMobileHeader = !sidebarPersistent && !isPhone;
  // Avatar + name in the sidebar footer button below is swapped for a plain
  // Settings icon when installed as a PWA - display mode doesn't change
  // without a fresh install, so no need to track this as reactive state.
  const isPWA = isStandalone();
  // The header only overlays a cover when it's actually rendered at all.
  const showCoverOverlay = coverActive && showMobileHeader;
  // True wherever a cover reaches the very top edge - under the
  // tablet-portrait header's transparent overlay, or (with no header at all)
  // straight under the phone's status bar/Dynamic Island.
  const coverFullBleed = showCoverOverlay || (isPhone && coverActive);
  // Where ObjectDetailPage.tsx's sticky action-toolbar should stop when
  // scrolling. A sticky element's own `top` stacks *on top of* its
  // scrolling ancestor's padding-top (the padding already shifts the
  // scrollport's sticky-constraint box down by that much, then `top` shifts
  // it down again) - so whenever <main>'s own padding-top already supplies
  // the right offset (no cover: header height, safe-area, or 0 - see
  // <main>'s own style below), this stays 0 to avoid double-applying it.
  // Only with a cover (where <main> has *no* padding-top, so the cover
  // itself can reach the true top edge - see CoverImage.tsx's negative
  // margin) does the offset have to come from `top` itself instead.
  const stickyToolbarTop = !coverActive ? "0px" : showMobileHeader ? MOBILE_HEADER_HEIGHT : isPhone ? MOBILE_TOP_BAR_HEIGHT : "0px";

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

  return (
    // `position: fixed; inset: 0`, not `h-dvh`/`h-screen`/a JS-measured
    // height - iOS WKWebView's `window.innerHeight`/`visualViewport.height`/
    // the `dvh` unit can all misreport the real viewport (confirmed on
    // device: several dozen px short after a cold launch, and permanently
    // after the on-screen keyboard has opened once - see useKeyboardInset.ts
    // for the keyboard-open case). `fixed; inset: 0` sidesteps that whole
    // class of bug instead of trying to measure around it: the browser pins
    // this element to the real viewport bounds directly, no JS number
    // involved. Descendants that need to reflow above the on-screen keyboard
    // (the phone bottom bar) use useKeyboardInset.ts instead of relying on
    // this element's own size.
    <div className="flex" style={{ position: "fixed", inset: 0 }}>

      {sidebarOpen && !sidebarPersistent && (
        <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface-raised transition-transform duration-200 ease-in-out ${
          sidebarPersistent ? "relative z-0 translate-x-0" : sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {shareToken ? (
          <div
            className="flex items-center gap-2 border-b border-border px-4 pb-4"
            style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
          >
            <Icon name={workspace?.icon ?? "sparkles"} className="h-5 w-5 text-accent" />
            <span className="truncate font-medium">{workspace?.name ?? t("nav.loading")}</span>
            <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted">{t("nav.shared")}</span>
          </div>
        ) : (
          <div className="relative border-b border-border" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
            <button
              onClick={() => setWorkspaceMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-4 pb-4 text-left hover:bg-surface"
            >
              <Icon name={workspace?.icon ?? "sparkles"} className="h-5 w-5 text-accent" />
              <span className="truncate font-medium">{workspace?.name ?? t("nav.loading")}</span>
            </button>
            <IOSMenu open={workspaceMenuOpen} onClose={() => setWorkspaceMenuOpen(false)} align="start" widthClassName="w-56">
              <IOSMenuGroup>
                <IOSMenuItem
                  icon="settings"
                  label={t("nav.workspaceSettings")}
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    navigate(`/w/${workspaceId}/settings`);
                  }}
                />
              </IOSMenuGroup>
            </IOSMenu>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {workspace?.dashboardObjectId && (
            <NavLink to={`/w/${workspaceId}/objects/${workspace.dashboardObjectId}`} className={({ isActive }) => navLinkClass(isActive)}>
              <Icon name="layout-dashboard" className="h-4 w-4" /> {t("nav.dashboard")}
            </NavLink>
          )}
          <ObjectTypeMenu workspaceId={workspaceId!} />
          <NavLink to={`/w/${workspaceId}/search`} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon name="search" className="h-4 w-4" /> {t("nav.search")}
          </NavLink>
          {pinnedIds.length > 0 && (
            <div className="mt-3">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t("nav.pinned")}</p>
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
                      <PinnedNavItem
                        key={objectId}
                        workspaceId={workspaceId!}
                        objectId={objectId}
                        onTouchArmStart={pinDragSelectGuard.onTouchArmStart}
                      />
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
        </nav>

        <div
          className="flex items-center justify-between border-t border-border p-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {shareToken ? (
            <span className="truncate text-sm text-ink-muted">{t("nav.sharedViaLink")}</span>
          ) : (
            <div className="relative min-w-0">
              <button
                onClick={() => setAvatarMenuOpen((v) => !v)}
                className="flex items-center gap-2 overflow-hidden rounded-lg p-1 -m-1 text-left hover:bg-surface"
                title={t("nav.account")}
              >
                {isPWA ? (
                  <Icon name="settings" className="h-5 w-5 shrink-0 text-ink-muted" />
                ) : user?.avatarUrl && !sidebarAvatarImage.failed ? (
                  <img
                    src={sidebarAvatarImage.src}
                    onError={sidebarAvatarImage.onError}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: user?.avatarColor }}
                  >
                    {user?.name?.[0]}
                  </span>
                )}
                <span className="truncate text-sm">{isPWA ? t("nav.settingsLabel") : user?.name}</span>
              </button>
              <IOSMenu open={avatarMenuOpen} onClose={() => setAvatarMenuOpen(false)} side="top" align="start" widthClassName="w-56">
                <IOSMenuGroup>
                  <IOSMenuItem
                    icon="board"
                    label={t("nav.switchWorkspace")}
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      navigate("/workspaces");
                    }}
                  />
                  <IOSMenuItem
                    icon="user"
                    label={t("nav.accountSettings")}
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      navigate("/settings");
                    }}
                  />
                  <IOSMenuItem
                    icon="close"
                    label={t("nav.logOut")}
                    destructive
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      void handleLogout();
                    }}
                  />
                </IOSMenuGroup>
              </IOSMenu>
            </div>
          )}
          <div className="flex items-center gap-1">
            {!shareToken && workspaceId && <NotificationBell workspaceId={workspaceId} />}
            <button onClick={toggle} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title={t("nav.toggleTheme")}>
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>
        </div>
      </aside>

      <div
        className="relative flex min-w-0 flex-1 flex-col"
        style={
          {
            ...(showMobileHeader && { "--mobile-header-h": MOBILE_HEADER_HEIGHT }),
            ...(isPhone && { "--mobile-top-bar-h": MOBILE_TOP_BAR_HEIGHT, "--bottom-tab-bar-h": MOBILE_BOTTOM_BAR_HEIGHT }),
            "--sticky-toolbar-top": stickyToolbarTop,
          } as CSSProperties
        }
      >
        {showMobileHeader && (
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
              title={t("nav.openMenu")}
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <span className={`truncate text-sm font-medium ${showCoverOverlay ? "text-white" : ""}`}>{workspace?.name}</span>
          </div>
        )}
        {isPhone && (
          // Masks the whole floating-pill zone (status bar strip through
          // where MobileTopBar's pills sit) with a top-to-bottom fade to the
          // plain page background. <main> below is a *scrolling* container,
          // and a scroll container's own `padding-top` only ever creates a
          // gap at scrollTop 0, so scrolled-past content would otherwise
          // show through in the gaps around/behind the pills (they're
          // separate floating pills with translucent backdrop-blur, not one
          // solid bar). ObjectDetailPage's sticky action-toolbar used to sit
          // right at this element's bottom edge and hand off to it there
          // (hence a since-reverted "stay opaque all the way down" version
          // of this gradient) - that toolbar is hidden entirely on phone now
          // (see its own comment), so there's nothing left to hand off to,
          // and this just fades to transparent again like a normal top
          // scroll-fade. Rendered *before* MobileTopBar below (same z-20) so
          // the pills themselves stack visually on top of this fade rather
          // than being dimmed by it. Always on, even at scrollTop 0 with a
          // cover - without viewport-fit=cover, nothing renders under the
          // status bar/Dynamic Island anyway, so there's no true full-bleed
          // cover shot to preserve by hiding this at the very top; leaving it
          // off there just left a hard edge instead.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-surface via-surface/90 to-transparent"
            style={{ height: "var(--mobile-top-bar-h)" }}
          />
        )}
        {isPhone && (
          <MobileTopBar
            workspaceId={workspaceId!}
            workspaceName={workspace?.name ?? "Workspace"}
            workspaceIcon={workspace?.icon ?? "sparkles"}
            dashboardObjectId={workspace?.dashboardObjectId ?? undefined}
          />
        )}
        {/* Only for a real member - an anonymous share visitor has no
            account to "install their copy" of the app for. Hidden while a
            cover is full-bleed under the top edge (tablet-portrait's overlay
            header, or phone's bare safe-area - see coverFullBleed below) -
            it's in main's normal flow, so left up it would push the cover
            down and break the "content reaches the very top" effect on its
            first (undismissed) showing. */}
        <main
          ref={mainRef}
          // `overscroll-none` (not just `-contain`) - without it, iOS's
          // rubber-band bounce past the true scroll end briefly overshoots
          // main's own bottom edge, exposing whatever sits behind it (the
          // fixed bottom fade/pill don't move with the bounce, so content
          // could flash past their straight edge) instead of just resisting
          // at the boundary. Also a class here, not just globals.css's
          // app-wide `*` rule, since a class selector otherwise wins the
          // specificity fight against that universal one and would silently
          // downgrade this element back to `contain`.
          className="min-w-0 flex-1 overflow-y-auto overscroll-none"
          style={{
            ...(showMobileHeader
              ? { paddingTop: "var(--mobile-header-h)" }
              : isPhone
                ? { paddingTop: coverActive ? 0 : "var(--mobile-top-bar-h)" }
                : undefined),
            // BottomTabBar is `position: fixed` now (see BottomTabBar.tsx),
            // so it no longer takes flow space here - reserve the matching
            // room at the bottom of the scroll area instead.
            ...(isPhone && { paddingBottom: "var(--bottom-tab-bar-h)" }),
          }}
        >
          {!shareToken && !coverFullBleed && <InstallAppHint />}
          {!shareToken && !coverFullBleed && <PushNotificationBanner />}
          <Outlet />
        </main>
        {isPhone && (
          // Mirrors the top fade above - iOS's WKWebView can settle on a
          // render surface a bit shorter than the real screen after a cold
          // launch (its safe-area-inset values stay correct even though the
          // surface itself doesn't extend as far as they claim), leaving a
          // sliver of unrendered space right at the true bottom edge that no
          // in-page fix can reach. Fading the last bit of scrolled content
          // into the page background instead of ending on a hard edge makes
          // that sliver read as intentional breathing room rather than a
          // glitch, whatever its actual size ends up being on a given device.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-surface via-surface/90 to-transparent"
            style={{ height: "var(--bottom-tab-bar-h)" }}
          />
        )}
        {isPhone && (
          <>
            <MobileBottomBar workspaceId={workspaceId!} dashboardObjectId={workspace?.dashboardObjectId ?? undefined} />
            <SearchSheet workspaceId={workspaceId!} />
          </>
        )}
      </div>
    </div>
  );
}
