import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { Message } from "@notorious/shared";
import { chatApi, systemApi, callApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { useChatRealtime } from "../../context/ChatRealtimeContext.js";
import { useCall } from "../../context/CallContext.js";
import { useKeyboardInset } from "../../hooks/useKeyboardInset.js";
import { MessageBubble } from "./MessageBubble.js";
import { Composer } from "./Composer.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { AiThreadView } from "./AiThreadView.js";
import { aiConversationWorkspaceId } from "./aiConversation.js";
import { dayKey, dayLabel } from "../../lib/chatDayLabels.js";
import { Icon } from "../ui/Icon.js";

const TYPING_TIMEOUT_MS = 5000;
const MESSAGES_PAGE_SIZE = 50;

/** Dispatches to the "Notorious AI" thread (a different backend entirely - see aiConversation.ts) or the real, DB-backed conversation thread below. Calls no hooks itself so switching between the two never trips the rules of hooks - each branch is its own component instance. */
export function ThreadView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const aiWorkspaceId = aiConversationWorkspaceId(conversationId);
  if (aiWorkspaceId) return <AiThreadView workspaceId={aiWorkspaceId} onBack={onBack} />;
  return <RealThreadView conversationId={conversationId} onBack={onBack} />;
}

function RealThreadView({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { setFocusedConversation, onTyping, onCallRing, onCallParticipants, onCallEnded } = useChatRealtime();
  const call = useCall();
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset();
  const keyboardMountedRef = useRef(false);
  const rafCleanupRef = useRef<(() => void) | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // How many messages (most recent N) the query currently asks for -
  // infinite scroll grows this instead of merging separate pages, so a
  // realtime `invalidateQueries(["chatMessages", conversationId])` (see
  // useGlobalRealtime.ts) - which re-runs this same queryFn - naturally
  // re-fetches the whole currently-loaded window instead of collapsing back
  // to the newest 50 and silently dropping history the user scrolled up to.
  const [loadedLimit, setLoadedLimit] = useState(MESSAGES_PAGE_SIZE);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  // Set for the duration of a loadOlder() round-trip so the messages-effect
  // below (which otherwise treats any count change as "new message(s),
  // scroll to bottom") instead restores the scroll offset and skips the
  // bottom-scroll/read-receipt side effects.
  const isLoadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Mirrors the `isAtBottom` state in a ref too - the messages-effect below
  // needs the current value without retriggering on every scroll tick, and
  // without depending on stale state from its own closure.
  const isAtBottomRef = useRef(true);
  // What the previous run of the messages-effect already scrolled/counted
  // up to, per conversation - `ThreadView` isn't remounted (no `key`) when
  // switching conversations, so this can't just live in a plain ref keyed
  // by conversationId alone.
  const processedRef = useRef<{ conversationId: string | null; count: number }>({ conversationId: null, count: 0 });

  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  const conversation = conversations?.find((c) => c.id === conversationId);

  const { data: messages } = useQuery({
    queryKey: ["chatMessages", conversationId, loadedLimit],
    queryFn: () => chatApi.listMessages(conversationId, { limit: loadedLimit }),
    placeholderData: keepPreviousData,
  });

  // Reset pagination state when switching threads - loadedLimit lives
  // outside processedRef's "is this a new thread" bookkeeping, so it needs
  // its own reset.
  useEffect(() => {
    setLoadedLimit(MESSAGES_PAGE_SIZE);
    setHasMoreOlder(true);
    setIsLoadingOlder(false);
    isLoadingOlderRef.current = false;
  }, [conversationId]);

  // A returned page shorter than what was asked for means we've reached the
  // real start of the conversation's (retained) history.
  useEffect(() => {
    if (messages && messages.length < loadedLimit) setHasMoreOlder(false);
  }, [messages, loadedLimit]);

  function loadOlder() {
    if (isLoadingOlderRef.current || !hasMoreOlder) return;
    const container = scrollContainerRef.current;
    prevScrollHeightRef.current = container?.scrollHeight ?? 0;
    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    setLoadedLimit((limit) => limit + MESSAGES_PAGE_SIZE);
  }
  // Read by the IntersectionObserver callback below, which is only set up
  // once per thread (see that effect's comment) - keeping it up to date
  // every render avoids that callback closing over a stale `loadOlder`.
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;

  // Auto-loads older messages once the sentinel above the oldest loaded
  // message scrolls into view - the standard chat-app "infinite scroll up"
  // trigger, no "load more" button. Set up once per thread (not on every
  // `messages` change - the sentinel node itself never unmounts) so that
  // prepending older messages and correcting the scroll offset afterwards
  // doesn't tear down and recreate the observer, which would replay its
  // "current state" callback and could re-trigger a load on its own.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    // IntersectionObserver invokes its callback once immediately on
    // observe() with the sentinel's current state - before the thread has
    // even auto-scrolled to the bottom on open - which would otherwise read
    // as "user scrolled to the top" and fire an unwanted load.
    let skippedInitial = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!skippedInitial) {
          skippedInitial = true;
          return;
        }
        if (entries[0]?.isIntersecting) loadOlderRef.current();
      },
      { root: container, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId]);

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

  function scrollToBottom(behavior: ScrollBehavior) {
    const el = scrollContainerRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior });
  }

  function stickToBottomIfNeeded() {
    if (isAtBottomRef.current) scrollToBottom("auto");
  }

  // The messages-effect below scrolls to bottom as soon as React commits the
  // new message list, but avatars/images without reserved dimensions still
  // grow the content afterwards, landing the scroll position a few px short
  // of the true bottom. A ResizeObserver on the content wrapper (not the
  // scroll container itself - that one's a fixed `h-full`, so its own box
  // never resizes) re-applies the same "stick to bottom" rule as that effect
  // (isAtBottomRef, kept up to date by both) whenever the content's actual
  // height changes for any reason, not just on the initial open. Attachment
  // images are also wired to call `stickToBottomIfNeeded` directly via
  // `onImageLoad` below - their own `onLoad` fires deterministically the
  // instant the browser knows their natural size, rather than waiting on
  // this observer's own (usually-immediate, but not guaranteed-synchronous)
  // batching of the resulting layout change.
  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => stickToBottomIfNeeded());
    observer.observe(content);
    return () => observer.disconnect();
    // stickToBottomIfNeeded reads isAtBottomRef.current fresh on every call, not a render-scoped
    // closure value - safe to attach the observer once and never re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pins the view to the bottom whenever the on-screen keyboard's height
  // changes (opening, closing, or resizing) - unconditionally, unlike the
  // "only if already at the bottom" rule elsewhere, since focusing the
  // composer is itself a strong signal the user wants to see the latest
  // message. Skips the very first run so opening a thread doesn't double up
  // with the messages-effect's own initial scroll (keyboardInset.bottom
  // starts at 0 on every mount, so that first effect run isn't a real
  // keyboard change).
  //
  // iOS fires several `visualViewport` resize events in a row while the
  // keyboard is still animating in, each with a still-growing inset - a
  // single synchronous scroll here lands short because ChatSheet's own
  // `bottom: keyboardInset.bottom` style (which is what actually shrinks
  // this container) hasn't finished being applied by the browser's next
  // layout/paint yet. Two nested `requestAnimationFrame`s re-issue the same
  // scroll after that layout has definitely settled - one frame for the
  // style to take effect, a second for iOS's own keyboard-driven reflow to
  // catch up - on top of the immediate call, which still covers the common
  // (non-iOS, no animation lag) case instantly.
  useEffect(() => {
    if (!keyboardMountedRef.current) {
      keyboardMountedRef.current = true;
      return;
    }
    scrollToBottom("auto");
    isAtBottomRef.current = true;
    setPendingCount(0);
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => scrollToBottom("auto"));
      rafCleanupRef.current = () => cancelAnimationFrame(raf2);
    });
    return () => {
      cancelAnimationFrame(raf1);
      rafCleanupRef.current?.();
    };
  }, [keyboardInset.bottom, keyboardInset.offsetTop]);

  function jumpToBottom() {
    scrollToBottom("smooth");
    isAtBottomRef.current = true;
    setPendingCount(0);
    const last = messages?.[messages.length - 1];
    if (last) markReadMutation.mutate(last.id);
  }

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    if (atBottom && pendingCount > 0) {
      setPendingCount(0);
      const last = messages?.[messages.length - 1];
      if (last) markReadMutation.mutate(last.id);
    }
  }

  // A new message (sent or received) always means whatever was being typed
  // just got sent - clear the indicator immediately instead of waiting out
  // TYPING_TIMEOUT_MS, and only show it again once a fresh "typing" event
  // arrives for the *next* message. Beyond that: jump to the bottom on
  // opening a thread or switching to it, on sending a message ourselves, or
  // on receiving one while already at the bottom - but if a message arrives
  // from someone else while scrolled up into history, leave the scroll
  // position alone and just count it for the "jump to bottom" button
  // instead (see `processedRef`'s own comment for why plain `[conversationId]`
  // isn't enough to detect "switched thread" here).
  useEffect(() => {
    if (!messages) return;

    if (isLoadingOlderRef.current) {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
      processedRef.current = { conversationId, count: messages.length };
      const container = scrollContainerRef.current;
      if (container) container.scrollTop += container.scrollHeight - prevScrollHeightRef.current;
      return;
    }

    clearTimeout(typingTimeoutRef.current);
    setTypingUserName(null);

    const isNewThread = processedRef.current.conversationId !== conversationId;
    const previousCount = isNewThread ? 0 : processedRef.current.count;
    const newMessages = messages.slice(previousCount);
    processedRef.current = { conversationId, count: messages.length };

    if (newMessages.length === 0) return;

    const hasOwnMessage = newMessages.some((m) => m.authorId === user?.id);
    if (isNewThread || hasOwnMessage || isAtBottomRef.current) {
      scrollToBottom("auto");
      isAtBottomRef.current = true;
      setPendingCount(0);
      const last = messages[messages.length - 1];
      if (last) markReadMutation.mutate(last.id);
    } else {
      setPendingCount((count) => count + newMessages.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, conversationId]);

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
          {conversation ? (conversation.type === "workspace_channel" ? `# ${conversation.name}` : conversation.name) : t("chat.thread.chatFallback")}
        </span>
        {callsEnabled &&
          (isInThisCall ? (
            <button
              onClick={() => void call.leaveCall()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
              title={t("chat.thread.leaveCall")}
            >
              <Icon name="phone-off" className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => (activeCall ? call.requestJoinCall(activeCall.callId, conversationId) : call.requestStartCall(conversationId))}
              disabled={call.phase !== "idle"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"
              title={t("chat.thread.call")}
            >
              <Icon name="phone" className="h-4 w-4" />
            </button>
          ))}
      </div>

      {activeCall && !isInThisCall && !call.isCallIgnored(activeCall.callId) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/10 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
            <Icon name="phone" className="h-3.5 w-3.5" />
            {t("chat.thread.callInProgress", { count: activeCall.participantUserIds.length })}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => call.requestJoinCall(activeCall.callId, conversationId)}
              disabled={call.phase !== "idle"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white hover:opacity-90 disabled:opacity-50"
              title={t("chat.thread.joinCall")}
            >
              <Icon name="phone" className="h-6 w-6" />
            </button>
            <button
              onClick={() => call.ignoreActiveCall(activeCall.callId)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
              title={t("chat.thread.ignore")}
            >
              <Icon name="phone-off" className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto py-2">
          <div ref={scrollContentRef}>
            <div ref={topSentinelRef} />
            {isLoadingOlder && (
              <div className="flex justify-center py-2">
                <Icon name="refresh" className="h-4 w-4 animate-spin text-ink-muted" />
              </div>
            )}
            {messages?.map((message, index) => {
              const previous = messages[index - 1];
              const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
              return (
                <div key={message.id} id={`chat-message-${message.id}`}>
                  {showDaySeparator && (
                    <div className="my-2 flex items-center justify-center">
                      <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">{dayLabel(message.createdAt)}</span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    conversationId={conversationId}
                    isDm={conversation?.type === "dm"}
                    deliveryStatus={message.id === lastOwnMessageId ? { readAt: lastOwnReadAt } : null}
                    onReply={setReplyTarget}
                    onImageLoad={stickToBottomIfNeeded}
                  />
                </div>
              );
            })}
            {typingUserName && <p className="px-4 py-1 text-xs italic text-ink-muted">{t("chat.thread.typing", { name: typingUserName })}</p>}
          </div>
        </div>

        {pendingCount > 0 && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-lg hover:opacity-90"
          >
            <Icon name="chevron-down" className="h-4 w-4" />
            {pendingCount}
          </button>
        )}
      </div>

      <Composer conversationId={conversationId} replyTarget={replyTarget} onCancelReply={() => setReplyTarget(null)} />
    </div>
  );
}
