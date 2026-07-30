// Module-level (not React state) so every call through `apiRequest`/`apiUpload`
// automatically carries the active share token, without threading it through
// every component that happens to call `objectApi`/`blockApi`/etc. while
// rendering a public share page - see SharePage.tsx.
let activeShareToken: string | null = null;

export function setShareMode(token: string | null): void {
  activeShareToken = token;
}

export function getShareToken(): string | null {
  return activeShareToken;
}

/**
 * Routes to an object's detail page - through the active public share (if
 * currently viewing one) instead of the normal, login-gated `/w/...` route,
 * which an anonymous visitor can't reach. Used anywhere a component links to
 * an *other* object (relation values, embedded sub-objects, backlinks) that
 * also needs to work when that component happens to be rendered on a shared
 * page.
 */
export function objectHref(workspaceId: string, objectId: string): string {
  const shareToken = getShareToken();
  return shareToken ? `/share/${shareToken}/objects/${objectId}` : `/w/${workspaceId}/objects/${objectId}`;
}
