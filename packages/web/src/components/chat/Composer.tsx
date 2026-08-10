import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@notorious/shared";
import { chatApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";

const TYPING_DEBOUNCE_MS = 2000;

export function Composer({
  conversationId,
  replyTarget,
  onCancelReply,
}: {
  conversationId: string;
  /** Set once the user long-presses a message and taps Reply (see MessageBubble.tsx/ThreadView.tsx) - shown as a quoted preview above the input, cleared on send or explicit cancel. */
  replyTarget?: Message | null;
  onCancelReply?: () => void;
}) {
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const queryClient = useQueryClient();
  const { sendTyping } = useChatRealtime();

  const sendMutation = useMutation({
    mutationFn: () =>
      chatApi.sendMessage(conversationId, {
        body,
        attachmentIds: pendingAttachments.length ? pendingAttachments.map((a) => a.id) : undefined,
        replyToId: replyTarget?.id,
      }),
    onSuccess: () => {
      setBody("");
      setPendingAttachments([]);
      onCancelReply?.();
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
      setPendingAttachments((attachments) => [...attachments, { id: attachment.id, filename: attachment.filename }]);
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() && pendingAttachments.length === 0) return;
    sendMutation.mutate();
  }

  const hasContent = body.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-2">
      {replyTarget && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
          <Icon name="reply" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-ink-muted">{replyTarget.authorName}</div>
            <div className="truncate text-xs text-ink-muted">{replyTarget.deletedAt ? "Message deleted" : replyTarget.body || "Attachment"}</div>
          </div>
          <button type="button" onClick={onCancelReply} className="shrink-0 rounded p-0.5 text-ink-muted hover:bg-border hover:text-ink" title="Cancel reply">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 px-1">
          {pendingAttachments.map((attachment) => (
            <span key={attachment.id} className="flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs text-ink-muted">
              <Icon name="paperclip" className="h-3 w-3" />
              {attachment.filename}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {/* No `accept` filter - any file type can be attached, not just images (see MessageBubble.tsx, which already renders non-image attachments as a download link). */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50"
          title="Attach a file"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
        <div className="relative flex-1">
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
            className="max-h-32 w-full resize-none rounded-full border border-border bg-surface py-2 pl-3 pr-10 text-sm text-ink outline-none focus:border-accent"
          />
          {hasContent ? (
            <button
              type="submit"
              disabled={sendMutation.isPending}
              className="absolute bottom-1 right-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40"
              title="Send"
            >
              <Icon name="arrow-up" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="absolute bottom-1 right-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
              title="Voice message"
              disabled
            >
              <Icon name="mic" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
