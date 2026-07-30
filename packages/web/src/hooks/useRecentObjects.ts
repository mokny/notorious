import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";

/**
 * Most-recently-opened objects, per workspace, most recent first - server-
 * backed (not localStorage) so the list is the same on every device a member
 * logs into. Only meaningful for a real logged-in member, so this quietly
 * no-ops when `user` is null (an anonymous share-link visitor) instead of
 * requiring every call site to check.
 */
export function useRecentObjects(workspaceId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = Boolean(workspaceId) && Boolean(user);
  const queryKey = ["recentlyViewed", workspaceId];

  const { data: recentIds = [] } = useQuery({
    queryKey,
    queryFn: () => workspaceApi.recentlyViewed(workspaceId!),
    enabled,
  });

  const touchMutation = useMutation({
    mutationFn: (objectId: string) => workspaceApi.touchRecentlyViewed(workspaceId!, objectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function addRecent(objectId: string): void {
    if (!enabled) return;
    touchMutation.mutate(objectId);
  }

  return { recentIds, addRecent };
}
