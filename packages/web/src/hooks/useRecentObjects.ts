import { useLocalStorageState } from "./useLocalStorageState.js";

const MAX_RECENT = 8;

/** Most-recently-opened objects, per workspace, most recent first. */
export function useRecentObjects(workspaceId: string | undefined) {
  const [recentIds, setRecentIds] = useLocalStorageState<string[]>(`notorious-recent-${workspaceId ?? ""}`, []);

  function addRecent(objectId: string): void {
    setRecentIds((prev) => [objectId, ...prev.filter((id) => id !== objectId)].slice(0, MAX_RECENT));
  }

  return { recentIds, addRecent };
}
