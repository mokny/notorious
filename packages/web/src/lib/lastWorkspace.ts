const STORAGE_KEY = "notorious-last-workspace";

export function getLastWorkspaceId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastWorkspaceId(workspaceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    // localStorage unavailable (e.g. strict privacy mode) - just falls back
    // to defaulting to the first workspace next time, no worse than before.
  }
}
