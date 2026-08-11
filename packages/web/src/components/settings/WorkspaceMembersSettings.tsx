import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { useRobustImage } from "../../hooks/useRobustImage.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";

const ROLES = ["viewer", "commenter", "editor"] as const;

/** Own component (not inlined in the members .map below) so useRobustImage's hook call stays valid per-member. */
function MemberAvatar({ avatarUrl, avatarColor, initial }: { avatarUrl: string; avatarColor: string; initial: string }) {
  const image = useRobustImage(avatarUrl);
  if (image.failed) {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: avatarColor }}
      >
        {initial}
      </span>
    );
  }
  return <img src={image.src} onError={image.onError} alt="" className="h-7 w-7 rounded-full object-cover" />;
}

export function WorkspaceMembersSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("editor");
  const [error, setError] = useState<string | null>(null);

  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const { data: members } = useQuery({ queryKey: ["workspaceMembers", workspaceId], queryFn: () => workspaceApi.members(workspaceId!) });
  const isOwner = workspace?.ownerId === user?.id;

  const inviteMutation = useMutation({
    mutationFn: () => workspaceApi.invite(workspaceId!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      setInviteEmail("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not invite this user"),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) => workspaceApi.updateMemberRole(workspaceId!, input.userId, input.role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(workspaceId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    inviteMutation.mutate();
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">Everyone below can access "{workspace?.name}".</p>

      <div className="mt-4 space-y-2">
        {members?.map((member) => (
          <div key={member.userId} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              {member.user.avatarUrl ? (
                <MemberAvatar avatarUrl={member.user.avatarUrl} avatarColor={member.user.avatarColor} initial={member.user.name[0] ?? "?"} />
              ) : (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: member.user.avatarColor }}
                >
                  {member.user.name[0]}
                </span>
              )}
              <div>
                <p className="text-sm font-medium">{member.user.name}</p>
                <p className="text-xs text-ink-muted">{member.user.email}</p>
              </div>
            </div>
            {isOwner && member.role !== "owner" ? (
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => roleMutation.mutate({ userId: member.userId, role: e.target.value })}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeMutation.mutate(member.userId)} className="text-xs text-red-500 hover:underline">
                  Remove
                </button>
              </div>
            ) : (
              <span className="text-xs capitalize text-ink-muted">{member.role}</span>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <form onSubmit={handleInvite} className="mt-4 flex gap-2">
          <TextField type="email" placeholder="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary">
            Invite
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
