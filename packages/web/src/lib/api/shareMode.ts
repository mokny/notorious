import type { WorkspaceRole } from "@notorious/shared";

interface ShareSession {
  token: string;
  role: WorkspaceRole;
  // "workspace" shares are redirected straight onto the normal, authenticated
  // `/w/:workspaceId` route tree (see SharePage.tsx) - the exact same pages a
  // logged-in member sees, so every link on them (`/w/...`) is already correct
  // as-is. "object" shares stay on the small `/share/:token` route tree, so
  // links to *other* objects (sub-objects, relations) need to be rewritten to
  // go through it instead - see `objectHref` below.
  scope: "object" | "workspace";
}

const STORAGE_KEY = "notorious_share_session";

/**
 * A whole-workspace share redirects onto the normal `/w/:workspaceId` route
 * tree, whose URL no longer carries the token - so a plain in-memory
 * variable wouldn't survive the visitor hitting refresh (or opening a
 * bookmarked/shared dashboard URL directly) while sitting on it: the page
 * reloads with a blank JS state and RequireAuth would bounce them to
 * /login. `sessionStorage` survives a reload but not closing the tab,
 * matching "this share session lasts for as long as this browser tab does".
 */
function readStoredSession(): ShareSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShareSession) : null;
  } catch {
    return null;
  }
}

// Module-level (not React state) so every call through `apiRequest`/`apiUpload`
// automatically carries the active share token, without threading it through
// every component that happens to call `objectApi`/`blockApi`/etc. while
// rendering a public share page - see SharePage.tsx. Initialized from
// storage so a page reload picks the session back up immediately, before
// anything else renders.
let session: ShareSession | null = readStoredSession();

export function setShareMode(info: ShareSession | null): void {
  session = info;
  try {
    if (info) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable (e.g. strict privacy mode) - the in-memory
    // value above still works for the rest of this page load either way.
  }
}

export function getShareToken(): string | null {
  return session?.token ?? null;
}

/** The role this browser tab is viewing/editing at, if it's an anonymous share session - null for a normal logged-in member. */
export function getShareRole(): WorkspaceRole | null {
  return session?.role ?? null;
}

/** True for any anonymous share session (object- or workspace-scoped). */
export function isSharedSession(): boolean {
  return session !== null;
}

/** Routes to an object's detail page - through the small `/share/:token` route tree for a single-object share (the only case where the normal `/w/...` route would be login-gated), otherwise the normal route, which is already correct for logged-in members and for workspace-scoped shares (redirected onto the real route tree - see SharePage.tsx). */
export function objectHref(workspaceId: string, objectId: string): string {
  if (session && session.scope === "object") {
    return `/share/${session.token}/objects/${objectId}`;
  }
  return `/w/${workspaceId}/objects/${objectId}`;
}
