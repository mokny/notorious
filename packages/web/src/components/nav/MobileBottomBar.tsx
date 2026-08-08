import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import { schemaApi, objectApi } from "../../lib/api/resources.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { reloadIfViewportShrunk, resetViewportReloadCount } from "../../hooks/useDynamicViewportHeight.js";
import { useAuth } from "../../context/AuthContext.js";
import { useSearchOverlay } from "../../context/SearchOverlayContext.js";
import { Icon } from "../ui/Icon.js";

/**
 * Floating pill-shaped bottom toolbar shown only on the phone breakpoint -
 * replaces the old flat 5-tab BottomTabBar.tsx (Home/Search/New/Menu/
 * Settings). Down to 3 actions (search, profile → settings, new object) -
 * Home and Menu/sidebar access moved into MobileTopBar.tsx's "…" overflow
 * menu instead, see that component's own doc comment.
 */
export function MobileBottomBar({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const shareToken = isSharedSession();
  const { user } = useAuth();
  const { open: openSearch } = useSearchOverlay();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevWorkspaceIdRef = useRef(workspaceId);

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

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center md:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface-raised/95 p-1.5 shadow-lg backdrop-blur">
        <button
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
          title="Search"
        >
          <Icon name="search" className="h-5 w-5" />
        </button>

        {!shareToken && (
          <button
            onClick={() => navigate(`/w/${workspaceId}/settings`)}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            title="Settings"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: user?.avatarColor }}
              >
                {user?.name?.[0]}
              </span>
            )}
          </button>
        )}

        {!shareToken && (
          <div ref={containerRef} className="relative">
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
              title="New object"
            >
              <Icon name="pencil" className="h-5 w-5" />
            </button>

            {newMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                <div className="absolute bottom-full right-0 z-50 mb-2 max-h-72 w-48 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
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
      </div>
    </nav>
  );
}
