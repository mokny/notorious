import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { useObjectHistory } from "../../context/ObjectHistoryContext.js";
import { useDeleteObject } from "../../hooks/useDeleteObject.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { ShareDialog } from "../ShareDialog.js";
import { ExportMenu } from "../ExportMenu.js";
import { Icon } from "../ui/Icon.js";

interface MobileTopBarProps {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  dashboardObjectId?: string;
  onOpenSidebar: () => void;
}

/**
 * Floating pill-shaped top header, phone breakpoint only - replaces the
 * "no header at all" phone previously had (see WorkspaceLayout.tsx's
 * `showMobileHeader`, which always excluded `isPhone`). Three parts, all
 * separate floating pills rather than one continuous bar (matches the
 * reference iOS-style app the user asked to match): a back button, a
 * title pill (current object's icon+title, or the workspace's own if
 * there isn't one - tap opens the visited-objects breadcrumb, see
 * ObjectHistoryContext.tsx), and a "…" overflow menu combining
 * object-specific actions (share/export/delete - only while on an actual
 * object page) with app-level navigation (home, sidebar, settings) that
 * used to live in the old flat BottomTabBar.
 */
export function MobileTopBar({ workspaceId, workspaceName, workspaceIcon, dashboardObjectId, onOpenSidebar }: MobileTopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { entries, current, goBack, jumpTo } = useObjectHistory();
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(breadcrumbRef, () => setBreadcrumbOpen(false));
  useClickOutside(menuRef, () => setMenuOpen(false));

  // The route itself doesn't expose params to a layout-level component like
  // this one (useParams() only sees params matched up to where it's
  // rendered, not a nested route's) - parsed from the URL instead. Good
  // enough here: only used to gate the object-actions section of the "…"
  // menu below, not to fetch anything.
  const routeObjectMatch = location.pathname.match(/\/objects\/([^/]+)/);
  const routeObjectId = routeObjectMatch?.[1];
  const onObjectPage = Boolean(routeObjectId) && current?.id === routeObjectId;
  const shareToken = isSharedSession();

  const { deleteObject } = useDeleteObject(workspaceId, onObjectPage ? routeObjectId : undefined);

  const title = onObjectPage && current ? current.title || "Untitled" : workspaceName;
  const icon = onObjectPage && current ? current.icon ?? "file-text" : workspaceIcon;

  function goHome() {
    navigate(dashboardObjectId ? `/w/${workspaceId}/objects/${dashboardObjectId}` : `/w/${workspaceId}`);
  }

  function handleBack() {
    const prevId = goBack();
    if (prevId) navigate(`/w/${workspaceId}/objects/${prevId}`);
    else goHome();
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center gap-2 px-2 md:hidden"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      <button
        onClick={handleBack}
        className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised/95 shadow-lg backdrop-blur"
        title="Back"
      >
        <Icon name="chevron-left" className="h-5 w-5" />
      </button>

      <div ref={breadcrumbRef} className="pointer-events-auto relative min-w-0 flex-1">
        <button
          onClick={() => setBreadcrumbOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-raised/95 px-3 py-2 text-left shadow-lg backdrop-blur"
        >
          <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        </button>

        {breadcrumbOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
            {entries.length === 0 && <p className="px-2 py-1.5 text-xs text-ink-muted">No objects visited yet this session.</p>}
            {[...entries].reverse().map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  jumpTo(entry.id);
                  navigate(`/w/${workspaceId}/objects/${entry.id}`);
                  setBreadcrumbOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${
                  entry.id === current?.id ? "text-accent" : ""
                }`}
              >
                <Icon name={entry.icon ?? "file-text"} className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{entry.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={menuRef} className="pointer-events-auto relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-raised/95 shadow-lg backdrop-blur"
          title="More"
        >
          <Icon name="more" className="h-5 w-5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
            {onObjectPage && !shareToken && (
              <>
                <p className="px-2 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">This object</p>
                <div className="px-1">
                  <ShareDialog workspaceId={workspaceId} objectId={routeObjectId!} label="Share" />
                </div>
                <div className="px-1">
                  <ExportMenu workspaceId={workspaceId} objectId={routeObjectId!} title={title} />
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void deleteObject(title);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" /> Delete
                </button>
                <div className="my-1 border-t border-border" />
              </>
            )}

            <p className="px-2 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Navigate</p>
            <button
              onClick={() => {
                setMenuOpen(false);
                goHome();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
            >
              <Icon name="layout-dashboard" className="h-4 w-4" /> Home
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSidebar();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
            >
              <Icon name="menu" className="h-4 w-4" /> Sidebar
            </button>
            {!shareToken && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate(`/w/${workspaceId}/settings`);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
              >
                <Icon name="settings" className="h-4 w-4" /> Settings
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
