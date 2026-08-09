import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, systemApi, callApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";
import { useCall } from "../../context/CallContext.js";
import { MessageBubble } from "./MessageBubble.js";
import { Composer } from "./Composer.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { AiThreadView } from "./AiThreadView.js";
import { aiConversationWorkspaceId } from "./aiConversation.js";
import { dayKey, dayLabel } from "../../lib/chatDayLabels.js";
import { Icon } from "../ui/Icon.js";

const TYPING_TIMEOUT_MS = 5000;

/** Dispatches to the "Notorious AI" thread (a different backend entirely - see aiConversation.ts) or the real, DB-backed conversation thread below. Calls no hooks itself so switching between the two never trips the rules of hooks - each branch is its own component instance. */
export function ThreadView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const aiWorkspaceId = aiConversationWorkspaceId(conversationId);
  if (aiWorkspaceId) return <AiThreadView workspaceId={aiWorkspaceId} onBack={onBack} />;
  return <RealThreadView conversationId={conversationId} onBack={onBack} />;
}

function RealThreadView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { setFocusedConversation, onTyping, onCallRing, onCallParticipants, onCallEnded } = useChatRealtime();
  const call = useCall();
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  const conversation = conversations?.find((c) => c.id === conversationId);

  const { data: messages } = useQuery({
    queryKey: ["chatMessages", conversationId],
    queryFn: () => chatApi.listMessages(conversationId),
  });

  // "Read <time>" under the last message *I* sent, once the other person
  // has read it - iMessage-style. Only shown for 1:1 DMs, not channels or
  // groups (a receipt-per-participant list wouldn't read as one clean line).
  const otherParticipant = conversation?.type === "dm" && conversation.otherParticipants.length === 1 ? conversation.otherParticipants[0] : null;
  let lastOwnMessageId: string | null = null;
  let lastOwnReadAt: string | null = null;
  if (otherParticipant && messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i]!;
      if (candidate.authorId === user?.id) {
        lastOwnMessageId = candidate.id;
        lastOwnReadAt = candidate.readBy.find((r) => r.userId === otherParticipant.userId)?.readAt ?? null;
        break;
      }
    }
  }

  const markReadMutation = useMutation({
    mutationFn: (upToMessageId: string) => chatApi.markRead(conversationId, upToMessageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatConversations"] }),
  });

  const { data: callsStatus } = useQuery({ queryKey: ["callsStatus"], queryFn: systemApi.callsStatus, staleTime: 60_000 });
  const callsEnabled = callsStatus?.enabled ?? false;

  const { data: activeCall } = useQuery({
    queryKey: ["activeCall", conversationId],
    queryFn: () => callApi.activeCall(conversationId),
    enabled: callsEnabled,
  });

  // Keeps the "call in progress - join" banner live without a client-side
  // heartbeat - refetch on any call event that could plausibly affect this
  // conversation's active-call state (ring, roster change, ended).
  useEffect(() => {
    if (!callsEnabled) return;
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["activeCall", conversationId] });
    const unsubscribers = [
      onCallRing((_callId, ringConversationId) => ringConversationId === conversationId && refetch()),
      onCallParticipants((_callId, participantsConversationId) => participantsConversationId === conversationId && refetch()),
      onCallEnded((_callId, endedConversationId) => endedConversationId === conversationId && refetch()),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [callsEnabled, conversationId, onCallRing, onCallParticipants, onCallEnded, queryClient]);

  const isInThisCall = call.phase === "active" && call.conversationId === conversationId;

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

  // A new message (sent or received) always means whatever was being typed
  // just got sent - clear the indicator immediately instead of waiting out
  // TYPING_TIMEOUT_MS, and only show it again once a fresh "typing" event
  // arrives for the *next* message.
  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (last) markReadMutation.mutate(last.id);
    clearTimeout(typingTimeoutRef.current);
    setTypingUserName(null);
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
        {conversation?.type === "workspace_channel" ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface">
            <Icon name={conversation.workspaceIcon ?? "sparkles"} className="h-4 w-4 text-ink-muted" />
          </span>
        ) : (
          otherParticipant && <ChatAvatar name={otherParticipant.name} avatarColor={otherParticipant.avatarColor} avatarUrl={otherParticipant.avatarUrl} size={7} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {conversation ? (conversation.type === "workspace_channel" ? `# ${conversation.name}` : conversation.name) : "Chat"}
        </span>
        {callsEnabled &&
          (isInThisCall ? (
            <button
              onClick={() => void call.leaveCall()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
              title="Leave call"
            >
              <Icon name="phone-off" className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => void (activeCall ? call.joinCall(activeCall.callId, conversationId) : call.startCall(conversationId))}
              disabled={call.phase !== "idle"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"
              title="Call"
            >
              <Icon name="phone" className="h-4 w-4" />
            </button>
          ))}
      </div>

      {activeCall && !isInThisCall && !call.isCallIgnored(activeCall.callId) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/10 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
            <Icon name="phone" className="h-3.5 w-3.5" />
            Call in progress · {activeCall.participantUserIds.length} {activeCall.participantUserIds.length === 1 ? "participant" : "participants"}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => void call.joinCall(activeCall.callId, conversationId)}
              disabled={call.phase !== "idle"}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white hover:opacity-90 disabled:opacity-50"
              title="Join call"
            >
              <Icon name="phone" className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => call.ignoreActiveCall(activeCall.callId)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
              title="Ignore"
            >
              <Icon name="phone-off" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {messages?.map((message, index) => {
          const previous = messages[index - 1];
          const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-2 flex items-center justify-center">
                  <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">{dayLabel(message.createdAt)}</span>
                </div>
              )}
              <MessageBubble message={message} conversationId={conversationId} readAt={message.id === lastOwnMessageId ? lastOwnReadAt : null} />
            </div>
          );
        })}
        {typingUserName && <p className="px-4 py-1 text-xs italic text-ink-muted">{typingUserName} is typing…</p>}
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversationId} />
    </div>
  );
}
