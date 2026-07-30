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
