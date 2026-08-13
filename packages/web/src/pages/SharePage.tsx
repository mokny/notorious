import { createContext, useContext } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { ResolvedShareLink } from "@notorious/shared";
import { shareLinkApi } from "../lib/api/resources.js";
import { setShareMode } from "../lib/api/shareMode.js";
import { useRealtime } from "../lib/ws/useRealtime.js";
import { ObjectDetailPage } from "./ObjectDetailPage.js";
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
 * lib/api/shareMode.ts), resolves what it grants access to, then either:
 *
 * - a whole-workspace share redirects straight onto the normal `/w/:workspaceId`
 *   route tree - the exact same dashboard, sidebar/dropdown navigation and
 *   views a logged-in member gets (see App.tsx's `RequireAuth` and
 *   WorkspaceLayout.tsx, both of which special-case an active share session).
 * - a single-object share renders a small, focused view of just that one
 *   object instead (via the nested routes below), since it can't grant
 *   access to browse anywhere else.
 */
export function SharePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();

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

  // Set synchronously during render, not in an effect - by the time any
  // child's useQuery fetcher actually runs (after this render commits), the
  // token/role/scope must already be in place. Plain module state, not React
  // state, so this is safe to do outside an effect.
  // Deliberately not cleared on unmount: a whole-workspace share redirects
  // onto the normal `/w/:workspaceId` tree below (WorkspaceLayout,
  // ObjectDetailPage, ...), which needs this to still be set by the time it
  // mounts - and an anonymous visitor has no other logged-in session in this
  // tab to protect by clearing it. A fresh page load resets it naturally.
  if (token && resolved) {
    setShareMode({ token, role: resolved.role, scope: resolved.objectId ? "object" : "workspace" });
  }

  useRealtime(resolved?.objectId ? resolved.workspaceId : undefined, token);

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
        <p className="text-lg font-medium">{t("sharePage.linkExpiredTitle")}</p>
        <p className="text-sm text-ink-muted">{t("sharePage.linkExpiredDescription")}</p>
      </div>
    );
  }

  if (!resolved.objectId) {
    // Whole-workspace share: reuse the exact same experience a logged-in
    // member gets, instead of a separate cut-down browsing UI.
    return <Navigate to={`/w/${resolved.workspaceId}`} replace />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Icon name={resolved.workspaceIcon} className="h-5 w-5" />
        <span className="font-medium">{resolved.workspaceName}</span>
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs capitalize text-ink-muted">
          {t("sharePage.sharedRole", { role: resolved.role })}
        </span>
      </header>
      <ShareResolutionContext.Provider value={resolved}>
        <Outlet />
      </ShareResolutionContext.Provider>
    </div>
  );
}

/** `/share/:token` index - the one object a single-object share grants access to. */
export function SharedIndexRoute() {
  const resolved = useShareResolution();
  return (
    <ObjectDetailPage
      workspaceId={resolved.workspaceId}
      objectId={resolved.objectId!}
      share={{ role: resolved.role, singleObject: true }}
    />
  );
}

/** `/share/:token/objects/:objectId` - reachable from a sub-object/relation link embedded within the shared object's content (see `objectHref` in shareMode.ts). Still scoped to the same single object server-side; anything else 403s with a friendly message (see ObjectDetailPage's error state). */
export function SharedObjectRoute() {
  const resolved = useShareResolution();
  const { objectId } = useParams<{ objectId: string }>();

  return (
    <ObjectDetailPage
      workspaceId={resolved.workspaceId}
      objectId={objectId}
      share={{ role: resolved.role, singleObject: true }}
    />
  );
}
