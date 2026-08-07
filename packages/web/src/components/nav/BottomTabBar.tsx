import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import { schemaApi, objectApi } from "../../lib/api/resources.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { Icon } from "../ui/Icon.js";

/**
 * Fixed bottom tab bar shown only on the phone breakpoint (see WorkspaceLayout,
 * which renders this instead of relying on the hamburger drawer alone). The
 * drawer stays reachable via the "Menu" tab for everything secondary
 * (settings, pinned items, recents, workspace switch, logout).
 */
export function BottomTabBar({
  workspaceId,
  dashboardObjectId,
  onOpenMenu,
}: {
  workspaceId: string;
  dashboardObjectId?: string;
  onOpenMenu: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const shareToken = isSharedSession();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const isHome = dashboardObjectId ? location.pathname === `/w/${workspaceId}/objects/${dashboardObjectId}` : location.pathname === `/w/${workspaceId}`;
  const isSearch = location.pathname === `/w/${workspaceId}/search`;

  return (
    // `fixed` + `bottom-0`, not a normal flex-column child - pins the bar
    // directly to the browser's own current viewport edge on every paint,
    // instead of depending on the h-dvh flex column above (WorkspaceLayout)
    // computing the exact same height. `<main>`'s own padding-bottom
    // (--bottom-tab-bar-h, see WorkspaceLayout.tsx) reserves the matching
    // space so scrolled content doesn't end up hidden underneath. z-20 (not
    // z-30) so the sidebar drawer's backdrop still covers this when open,
    // same as before. On the WKWebView cold-launch viewport bug this bar can
    // still float above the real edge on - see
    // useIOSStandaloneViewportFix.ts, which reloads once to correct it.
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-raised md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-[52px] items-stretch">
        <button
          onClick={() => navigate(dashboardObjectId ? `/w/${workspaceId}/objects/${dashboardObjectId}` : `/w/${workspaceId}`)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isHome ? "text-accent" : "text-ink-muted"}`}
        >
          <Icon name="layout-dashboard" className="h-5 w-5" />
          Home
        </button>

        <button
          onClick={() => navigate(`/w/${workspaceId}/search`)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isSearch ? "text-accent" : "text-ink-muted"}`}
        >
          <Icon name="search" className="h-5 w-5" />
          Search
        </button>

        {!shareToken && (
          <div ref={containerRef} className="relative flex flex-1">
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-ink-muted"
            >
              <Icon name="plus" className="h-5 w-5" />
              New
            </button>

            {newMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                <div className="absolute bottom-full left-1/2 z-50 mb-2 max-h-72 w-48 -translate-x-1/2 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                  {objectTypes &&
                    sortObjectTypesForDisplay(objectTypes).map((type) => (
                      <button
                        key={type.id}
                        onClick={() => createObjectMutation.mutate(type.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
                      >
                        <Icon name={type.icon} className="h-3.5 w-3.5" />
                        {type.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        <button onClick={onOpenMenu} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-ink-muted">
          <Icon name="menu" className="h-5 w-5" />
          Menu
        </button>
      </div>
    </nav>
  );
}
