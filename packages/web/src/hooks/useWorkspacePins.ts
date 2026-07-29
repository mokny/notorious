import { useLocalStorageState } from "./useLocalStorageState.js";

/** Objects pinned to the sidebar, per workspace. A personal, per-device preference. */
export function useWorkspacePins(workspaceId: string | undefined) {
  const [pinnedIds, setPinnedIds] = useLocalStorageState<string[]>(`notorious-pins-${workspaceId ?? ""}`, []);

  function isPinned(objectId: string): boolean {
    return pinnedIds.includes(objectId);
  }

  function toggle(objectId: string): void {
    setPinnedIds((prev) => (prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId]));
  }

  return { pinnedIds, isPinned, toggle };
}
