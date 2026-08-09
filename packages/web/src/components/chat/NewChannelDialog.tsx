import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, workspaceApi } from "../../lib/api/resources.js";
import { Modal } from "../ui/Modal.js";

/** Channels are open by design - any member (any role) can create one, and every workspace member can see/join it. */
export function NewChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (conversationId: string) => void }) {
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list, enabled: open });
  const effectiveWorkspaceId = workspaceId || workspaces?.[0]?.id || "";

  const createMutation = useMutation({
    mutationFn: () => chatApi.createChannel(effectiveWorkspaceId, { name }),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
      setName("");
      onOpenChange(false);
      onCreated(conversation.id);
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New channel"
      description="Open to every member of the workspace you pick."
      footer={
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !name.trim() || !effectiveWorkspaceId}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Create channel
        </button>
      }
    >
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
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="channel-name"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
    </Modal>
  );
}
