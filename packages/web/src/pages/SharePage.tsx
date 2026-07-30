import { createContext, useContext, useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ResolvedShareLink } from "@notorious/shared";
import { shareLinkApi } from "../lib/api/resources.js";
import { setShareMode } from "../lib/api/shareMode.js";
import { ObjectDetailPage } from "./ObjectDetailPage.js";
import { SharedWorkspaceBrowse } from "./SharedWorkspaceBrowse.js";
import { Icon } from "../components/ui/Icon.js";

const ShareResolutionContext = createContext<ResolvedShareLink | null>(null);

function useShareResolution(): ResolvedShareLink {
  const ctx = useContext(ShareResolutionContext);
  if (!ctx) throw new Error("useShareResolution must be used within SharePage");
  return ctx;
}

/**
 * Entry point for `/share/:token` - a public route (outside `RequireAuth`,
 * see App.tsx) that anonymous visitors land on. Activates share mode so
 * every subsequent API call in this tab carries the token (see
 * lib/api/shareMode.ts), resolves what it grants access to, then renders
 * either a single shared object or a small browse UI for a whole shared
 * workspace via the nested routes below.
 */
export function SharePage() {
  const { token } = useParams<{ token: string }>();

  // Set synchronously during render, not in an effect - by the time any
  // child's useQuery fetcher actually runs (after this render commits), the
  // token must already be in place. Plain module state, not React state, so
  // this is safe to do outside an effect.
  if (token) setShareMode(token);
  useEffect(() => () => setShareMode(null), []);

  const {
    data: resolved,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["shareResolve", token],
    queryFn: () => shareLinkApi.resolve(token!),
    enabled: Boolean(token),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (isError || !resolved) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <Icon name="close" className="h-8 w-8 text-ink-muted" />
        <p className="text-lg font-medium">This link doesn't work anymore</p>
        <p className="text-sm text-ink-muted">It may have been revoked, or it has expired.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Icon name={resolved.workspaceIcon} className="h-5 w-5" />
        <span className="font-medium">{resolved.workspaceName}</span>
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs capitalize text-ink-muted">
          Shared · {resolved.role}
        </span>
      </header>
      <ShareResolutionContext.Provider value={resolved}>
        <Outlet />
      </ShareResolutionContext.Provider>
    </div>
  );
}

/** `/share/:token` index - either the one shared object, or a browse UI for a shared workspace. */
export function SharedIndexRoute() {
  const resolved = useShareResolution();

  if (resolved.objectId) {
    return (
      <ObjectDetailPage
        workspaceId={resolved.workspaceId}
        objectId={resolved.objectId}
        share={{ role: resolved.role, singleObject: true }}
      />
    );
  }

  return <SharedWorkspaceBrowse workspaceId={resolved.workspaceId} />;
}

/** `/share/:token/objects/:objectId` - only reachable when browsing a whole shared workspace. */
export function SharedObjectRoute() {
  const resolved = useShareResolution();
  const { objectId } = useParams<{ objectId: string }>();

  return (
    <ObjectDetailPage
      workspaceId={resolved.workspaceId}
      objectId={objectId}
      share={{ role: resolved.role, singleObject: false }}
    />
  );
}
