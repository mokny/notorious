import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message, CallSummary } from "@notorious/shared";
import { chatApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { Icon } from "../ui/Icon.js";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/** Compact system-style row for a call outcome (missed/declined/ended) - iMessage/WhatsApp style, replaces the normal chat bubble entirely. See `chat/calls/service.ts::writeCallHistoryMessage`. */
function CallLogRow({ call, createdAt }: { call: CallSummary; createdAt: string }) {
  const label =
    call.status === "missed"
      ? "Missed call"
      : call.status === "declined"
        ? "Declined call"
        : `Call ended · ${formatCallDuration(call.durationSeconds ?? 0)}`;

  return (
    <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-ink-muted">
      <Icon name={call.status === "missed" || call.status === "declined" ? "phone-off" : "phone"} className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span>· {new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 450;

export function MessageBubble({
  message,
  conversationId,
  isDm,
  deliveryStatus,
  onReply,
}: {
  message: Message;
  conversationId: string;
  /** Hides the sender name next to messages from the other person - redundant in a 1:1 thread, still needed to tell participants apart in a group/channel. */
  isDm: boolean;
  /** Set only on the last message I sent in a 1:1 DM - iMessage-style "Delivered"/"Read <time>" line under it. Absent everywhere else (groups/channels, or not the last own message). */
  deliveryStatus?: { readAt: string | null } | null;
  /** Opens the composer's reply-preview for this message - absent for call-log rows (see caller), which have nothing quotable. */
  onReply: (message: Message) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwn = message.authorId === user?.id;

  const [showPicker, setShowPicker] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pickerRef = useRef<HTMLDivElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["chatMessages", conversationId] });

  const deleteMutation = useMutation({ mutationFn: () => chatApi.deleteMessage(message.id), onSuccess: invalidate });
  const reactMutation = useMutation({ mutationFn: (emoji: string) => chatApi.react(message.id, { emoji }), onSuccess: invalidate });
  const unreactMutation = useMutation({ mutationFn: (emoji: string) => chatApi.unreact(message.id, emoji), onSuccess: invalidate });

  const myReactions = new Set(message.reactions.filter((r) => r.userId === user?.id).map((r) => r.emoji));
  const reactionCounts = new Map<string, number>();
  for (const r of message.reactions) reactionCounts.set(r.emoji, (reactionCounts.get(r.emoji) ?? 0) + 1);

  function toggleReaction(emoji: string) {
    setShowPicker(false);
    if (myReactions.has(emoji)) unreactMutation.mutate(emoji);
    else reactMutation.mutate(emoji);
  }

  function reply() {
    setShowPicker(false);
    onReply(message);
  }

  function scrollToReplyOriginal(id: string) {
    document.getElementById(`chat-message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function startLongPress() {
    longPressTimerRef.current = setTimeout(() => setShowPicker(true), LONG_PRESS_MS);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimerRef.current);
  }

  // Tap-outside-to-dismiss - a plain document listener (not onBlur) since
  // the trigger is a `<div>`, not a focusable element.
  useEffect(() => {
    if (!showPicker) return;
    function handleOutside(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setShowPicker(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [showPicker]);

  if (message.call) return <CallLogRow call={message.call} createdAt={message.createdAt} />;

  return (
    <div className={`flex flex-col gap-0.5 px-3 py-1 ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && !isDm && <span className="px-1 text-xs font-medium text-ink-muted">{message.authorName}</span>}
      <div className="relative flex items-center gap-1">
        {/* Same long-press reveal as the reaction picker below - not a hover reveal, which has no touch equivalent. */}
        {isOwn && showPicker && !message.deletedAt && (
          <button
            onClick={() => {
              setShowPicker(false);
              deleteMutation.mutate();
            }}
            className="rounded p-1 text-ink-muted hover:bg-surface hover:text-red-500"
            title="Delete"
          >
            <Icon name="trash" className="h-3 w-3" />
          </button>
        )}
        <div
          onPointerDown={message.deletedAt ? undefined : startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onContextMenu={(event) => event.preventDefault()}
          className={`max-w-xs select-none rounded-2xl px-3 py-2 text-sm ${
            message.deletedAt ? "italic text-ink-muted bg-surface" : isOwn ? "bg-accent text-white" : "bg-chat-bubble text-ink"
          }`}
        >
          {message.deletedAt ? (
            "Message deleted"
          ) : (
            <>
              {message.replyTo && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    scrollToReplyOriginal(message.replyTo!.id);
                  }}
                  className={`mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs ${
                    isOwn ? "border-white/50 bg-white/10" : "border-ink-muted/40 bg-black/5"
                  }`}
                >
                  <div className="font-medium opacity-80">{message.replyTo.authorName}</div>
                  <div className="truncate opacity-70">{message.replyTo.deleted ? "Message deleted" : message.replyTo.body || "Attachment"}</div>
                </button>
              )}
              {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
              {message.attachments.map((attachment) =>
                attachment.mimeType.startsWith("image/") ? (
                  <img key={attachment.id} src={chatApi.attachmentUrl(attachment.id)} alt={attachment.filename} className="mt-1 max-h-64 rounded-lg" />
                ) : (
                  <a
                    key={attachment.id}
                    href={chatApi.attachmentUrl(attachment.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 underline"
                  >
                    <Icon name="paperclip" className="h-3 w-3" />
                    {attachment.filename}
                  </a>
                ),
              )}
            </>
          )}
        </div>

        {/* Only shown after a long-press - not a hover reveal, since that has no touch equivalent and this is the primary phone surface for chat. */}
        {showPicker && !message.deletedAt && (
          <div ref={pickerRef} className={`absolute -top-16 z-10 ${isOwn ? "right-0" : "left-0"}`}>
            <ReactionPicker time={formatTime(message.createdAt)} onPick={toggleReaction} onReply={reply} />
          </div>
        )}
      </div>

      {reactionCounts.size > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {[...reactionCounts.entries()].map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => toggleReaction(emoji)}
              className={`rounded-full border px-1.5 py-0.5 text-xs ${myReactions.has(emoji) ? "border-accent bg-accent/10" : "border-border bg-surface"}`}
            >
              {emoji} {count}
            </button>
          ))}
        </div>
      )}

      {deliveryStatus && (
        <span className="px-1 text-[11px] text-ink-muted">{deliveryStatus.readAt ? `Read ${formatTime(deliveryStatus.readAt)}` : "Delivered"}</span>
      )}
    </div>
  );
}

function ReactionPicker({ time, onPick, onReply }: { time: string; onPick: (emoji: string) => void; onReply: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-raised p-1 shadow-lg">
      <span className="px-2 text-[11px] text-ink-muted">{time}</span>
      <div className="flex items-center gap-0.5">
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} onClick={() => onPick(emoji)} className="rounded-full p-0.5 text-sm hover:bg-surface">
            {emoji}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button onClick={onReply} className="rounded-full p-1 text-ink-muted hover:bg-surface hover:text-ink" title="Reply">
          <Icon name="reply" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
