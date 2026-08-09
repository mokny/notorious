import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../lib/api/resources.js";
import { ApiError } from "../../lib/api/client.js";
import { Modal } from "../ui/Modal.js";

/** "Add a contact" IS "start a chat" here - no separate address book, per the chat feature's requirements: entering a registered user's email immediately opens (or reuses) a DM, no confirmation flow. */
export function NewChatDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (conversationId: string) => void }) {
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      chatApi.createDm({
        emails: emails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
      }),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
      setEmails("");
      setError(null);
      onOpenChange(false);
      onCreated(conversation.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start chat"),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New chat"
      description="Enter the email of one or more registered users. Several emails (comma-separated) start a group."
      footer={
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !emails.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Start chat
        </button>
      }
    >
      <input
        autoFocus
        value={emails}
        onChange={(event) => setEmails(event.target.value)}
        placeholder="someone@example.com, other@example.com"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Modal>
  );
}
