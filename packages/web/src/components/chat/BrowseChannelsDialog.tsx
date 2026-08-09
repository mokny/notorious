import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, workspaceApi } from "../../lib/api/resources.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";

/**
 * Opened from the # icon in ConversationList - channels are open by design
 * (see chat/service.ts::listWorkspaceChannels), so the natural first step
 * is browsing what already exists and joining one, not jumping straight to
 * "create a new one" (that's still reachable, via the row at the bottom).
 */
export function BrowseChannelsDialog({
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: string) => void;
  onCreateNew: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list, enabled: open });
  const effectiveWorkspaceId = workspaceId || workspaces?.[0]?.id || "";

  const { data: channels, isLoading } = useQuery({
    queryKey: ["chatChannels", effectiveWorkspaceId],
    queryFn: () => chatApi.listChannels(effectiveWorkspaceId),
    enabled: open && Boolean(effectiveWorkspaceId),
  });

  const joinMutation = useMutation({
    mutationFn: (conversationId: string) => chatApi.joinChannel(effectiveWorkspaceId, conversationId),
    onSuccess: (_data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
      queryClient.invalidateQueries({ queryKey: ["chatChannels", effectiveWorkspaceId] });
      onOpenChange(false);
      onSelect(conversationId);
    },
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Channels" description="Every channel is open - join one, or start a new one.">
      <div className="flex flex-col gap-2">
        {workspaces && workspaces.length > 1 && (
          <select
            value={effectiveWorkspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        )}

        <div className="-mx-1 max-h-72 overflow-y-auto">
          {isLoading && <p className="px-1 py-2 text-sm text-ink-muted">Loading…</p>}
          {!isLoading && channels?.length === 0 && <p className="px-1 py-2 text-sm text-ink-muted">No channels in this workspace yet.</p>}
          {channels?.map((entry) => (
            <div key={entry.conversation.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-surface">
              <div className="flex min-w-0 items-center gap-1.5">
                <Icon name="hash" className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="truncate text-sm">{entry.conversation.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{entry.memberCount}</span>
              </div>
              {entry.joined ? (
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onSelect(entry.conversation.id);
                  }}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  Open
                </button>
              ) : (
                <button
                  onClick={() => joinMutation.mutate(entry.conversation.id)}
                  disabled={joinMutation.isPending}
                  className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Join
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={onCreateNew} className="flex items-center gap-1.5 self-start rounded-md px-1 py-1.5 text-sm text-accent hover:underline">
          <Icon name="plus" className="h-4 w-4" /> New channel
        </button>
      </div>
    </Modal>
  );
}
