import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@notorious/shared";
import { chatApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";
import { useSpeechToText, speechToTextSupported } from "../../hooks/useSpeechToText.js";
import { resizeTextarea } from "../../lib/resizeTextarea.js";

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
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSentRef = useRef(0);
  const queryClient = useQueryClient();
  const { sendTyping } = useChatRealtime();
  const { isListening, toggleListening } = useSpeechToText(setBody);

  // Re-run on every `body` change (typing, dictation, and the post-send clear) rather than only
  // on the textarea's own onChange, since useSpeechToText drives `body` directly.
  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [body]);

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
    setUploadError(null);
    try {
      const { promise } = chatApi.uploadAttachment(conversationId, file);
      const attachment = await promise;
      setPendingAttachments((attachments) => [...attachments, { id: attachment.id, filename: attachment.filename }]);
    } catch {
      setUploadError(t("chat.composer.attachFailed", { filename: file.name }));
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
            <div className="truncate text-xs text-ink-muted">{replyTarget.deletedAt ? t("chat.composer.messageDeleted") : replyTarget.body || t("chat.composer.attachment")}</div>
          </div>
          <button type="button" onClick={onCancelReply} className="shrink-0 rounded p-0.5 text-ink-muted hover:bg-border hover:text-ink" title={t("chat.composer.cancelReply")}>
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {uploadError && <div className="mb-1.5 px-1 text-xs text-red-500">{uploadError}</div>}
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
          title={t("chat.composer.attachFile")}
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
        {/* The button sits inside the pill as a flex child (not absolutely positioned) so it's always comfortably inset from the pill's own right-side curve, however tall the pill grows with a multi-line message - `items-end` keeps it pinned to the bottom-right corner as the textarea grows, matching iMessage/WhatsApp. */}
        <div className="flex flex-1 items-end gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1 focus-within:border-accent">
          <textarea
            ref={textareaRef}
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
            placeholder={t("chat.composer.placeholder")}
            className="min-w-0 max-h-[4.5rem] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm text-ink outline-none"
          />
          {/* While listening, this stays the (pulsing) stop control even once
              dictated text starts filling the field - it only falls back to
              the hasContent-driven send/mic logic below once recording ends,
              otherwise the button would swap out from under the user mid-dictation
              with no way to stop it. */}
          {isListening ? (
            <button
              type="button"
              onClick={toggleListening}
              className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-500 text-white"
              title={t("chat.composer.stopDictation")}
            >
              <Icon name="mic" className="h-4 w-4" />
            </button>
          ) : !hasContent && speechToTextSupported ? (
            <button
              type="button"
              onClick={toggleListening}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-border hover:text-ink"
              title={t("chat.composer.dictate")}
            >
              <Icon name="mic" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!hasContent || sendMutation.isPending}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                hasContent ? "bg-accent text-white hover:opacity-90" : "text-ink-muted"
              } disabled:opacity-40`}
              title={t("chat.composer.send")}
            >
              <Icon name="arrow-up" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
