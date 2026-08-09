import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../lib/api/resources.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";
import { MessageBubble } from "./MessageBubble.js";
import { Composer } from "./Composer.js";
import { Icon } from "../ui/Icon.js";

const TYPING_TIMEOUT_MS = 5000;

export function ThreadView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const { setFocusedConversation, onTyping } = useChatRealtime();
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  const conversation = conversations?.find((c) => c.id === conversationId);

  const { data: messages } = useQuery({
    queryKey: ["chatMessages", conversationId],
    queryFn: () => chatApi.listMessages(conversationId),
  });

  const markReadMutation = useMutation({
    mutationFn: (upToMessageId: string) => chatApi.markRead(conversationId, upToMessageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatConversations"] }),
  });

  // Focus tracking suppresses push notifications for whoever is actively
  // looking at this conversation (see focusState.ts on the server) - set on
  // mount, cleared on unmount/switching away.
  useEffect(() => {
    setFocusedConversation(conversationId);
    return () => setFocusedConversation(null);
  }, [conversationId, setFocusedConversation]);

  useEffect(() => {
    return onTyping((typingConversationId, _userId, userName) => {
      if (typingConversationId !== conversationId) return;
      setTypingUserName(userName);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUserName(null), TYPING_TIMEOUT_MS);
    });
  }, [conversationId, onTyping]);

  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (last) markReadMutation.mutate(last.id);
    bottomRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <button onClick={onBack} className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
        )}
        <span className="truncate text-sm font-semibold text-ink">
          {conversation ? (conversation.type === "workspace_channel" ? `# ${conversation.name}` : conversation.name) : "Chat"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {messages?.map((message) => <MessageBubble key={message.id} message={message} conversationId={conversationId} />)}
        {typingUserName && <p className="px-4 py-1 text-xs italic text-ink-muted">{typingUserName} is typing…</p>}
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversationId} />
    </div>
  );
}
