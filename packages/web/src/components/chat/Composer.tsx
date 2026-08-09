import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";

const TYPING_DEBOUNCE_MS = 2000;

export function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const queryClient = useQueryClient();
  const { sendTyping } = useChatRealtime();

  const sendMutation = useMutation({
    mutationFn: () => chatApi.sendMessage(conversationId, { body, attachmentIds: pendingAttachmentIds.length ? pendingAttachmentIds : undefined }),
    onSuccess: () => {
      setBody("");
      setPendingAttachmentIds([]);
      queryClient.invalidateQueries({ queryKey: ["chatMessages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
    },
  });

  function handleTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current > TYPING_DEBOUNCE_MS) {
      sendTyping(conversationId);
      lastTypingSentRef.current = now;
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { promise } = chatApi.uploadAttachment(conversationId, file);
      const attachment = await promise;
      setPendingAttachmentIds((ids) => [...ids, attachment.id]);
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() && pendingAttachmentIds.length === 0) return;
    sendMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-2">
      {pendingAttachmentIds.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 px-1">
          {pendingAttachmentIds.map((id) => (
            <span key={id} className="rounded bg-surface px-2 py-0.5 text-xs text-ink-muted">
              Attachment ready
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50"
          title="Attach an image"
        >
          <Icon name="paperclip" className="h-4 w-4" />
        </button>
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            handleTyping();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
          rows={1}
          placeholder="Message"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sendMutation.isPending || (!body.trim() && pendingAttachmentIds.length === 0)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40"
          title="Send"
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
