import { useQuery } from "@tanstack/react-query";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { isSharedSession } from "../lib/api/shareMode.js";

/** The current user's own membership role in a workspace - null for an anonymous share visitor (no membership) or while still loading. */
export function useWorkspaceRole(workspaceId: string | undefined) {
  const { user } = useAuth();
  const { data: members } = useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!),
    enabled: Boolean(workspaceId) && !isSharedSession(),
  });
  const role: WorkspaceRole | null = members?.find((member) => member.userId === user?.id)?.role ?? null;

  return {
    role,
    isOwner: role === "owner",
    canEdit: role ? roleAtLeast(role, "editor") : false,
  };
}
