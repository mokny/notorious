import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@notorious/shared";
import { chatApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { Icon } from "../ui/Icon.js";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 450;

export function MessageBubble({ message, conversationId }: { message: Message; conversationId: string }) {
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

  return (
    <div className={`group flex flex-col gap-0.5 px-3 py-1 ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && <span className="px-1 text-xs font-medium text-ink-muted">{message.authorName}</span>}
      <div className="relative flex items-center gap-1">
        {isOwn && !message.deletedAt && (
          <button
            onClick={() => deleteMutation.mutate()}
            className="opacity-0 group-hover:opacity-100 rounded p-1 text-ink-muted hover:bg-surface hover:text-red-500"
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
            message.deletedAt ? "italic text-ink-muted bg-surface" : isOwn ? "bg-accent text-white" : "bg-surface text-ink"
          }`}
        >
          {message.deletedAt ? (
            "Message deleted"
          ) : (
            <>
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

        {/* Only shown after a long-press (see startLongPress) - not a hover reveal, since that has no touch equivalent and this is the primary phone surface for chat. */}
        {showPicker && !message.deletedAt && (
          <div ref={pickerRef} className={`absolute -top-9 z-10 ${isOwn ? "right-0" : "left-0"}`}>
            <ReactionPicker onPick={toggleReaction} />
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

      <span className="px-1 text-[11px] text-ink-muted">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface-raised p-0.5 shadow-lg">
      {QUICK_REACTIONS.map((emoji) => (
        <button key={emoji} onClick={() => onPick(emoji)} className="rounded-full p-0.5 text-sm hover:bg-surface">
          {emoji}
        </button>
      ))}
    </div>
  );
}
