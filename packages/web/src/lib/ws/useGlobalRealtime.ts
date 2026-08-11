import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ChatRealtimeMessage, MediaKind, ProducerSource } from "@notorious/shared";
import { clientId as myClientId } from "./clientId.js";
import { updateAppBadge } from "../chatBadge.js";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

type TypingListener = (conversationId: string, userId: string, userName: string) => void;
type CallRingListener = (callId: string, conversationId: string, initiatorId: string, initiatorName: string) => void;
type CallTakenListener = (callId: string) => void;
type CallParticipantsListener = (callId: string, conversationId: string, participants: { userId: string; clientId: string }[]) => void;
type MediaNewProducerListener = (callId: string, producerId: string, userId: string, clientId: string, kind: MediaKind, source: ProducerSource) => void;
type MediaProducerClosedListener = (callId: string, producerId: string) => void;
type CallEndedListener = (callId: string, conversationId: string, reason: "hangup" | "declined" | "missed") => void;

function handleChatMessage(payload: ChatRealtimeMessage, queryClient: QueryClient): void {
  switch (payload.type) {
    case "chatMessage":
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
      queryClient.invalidateQueries({ queryKey: ["chatMessages", payload.conversationId] });
      break;
    case "chatMessageDeleted":
      queryClient.invalidateQueries({ queryKey: ["chatMessages", payload.conversationId] });
      break;
    case "chatReaction":
      queryClient.invalidateQueries({ queryKey: ["chatMessages", payload.conversationId] });
      break;
    case "chatReadReceipt":
      queryClient.invalidateQueries({ queryKey: ["chatMessages", payload.conversationId] });
      break;
    case "chatConversation":
      queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
      break;
    case "chatUnreadCount":
      updateAppBadge(payload.unreadConversationCount);
      break;
    case "sessionRevoked":
      // Refetching ["me"] hits GET /api/v1/auth/me with the now-deleted
      // session cookie, which 401s - AuthContext.tsx already treats that as
      // "no user", and RequireAuth (App.tsx) redirects to /login the moment
      // `user` goes null. No separate "force logout" UI path needed.
      queryClient.invalidateQueries({ queryKey: ["me"] });
      break;
    case "chatTyping":
    case "callRing":
    case "callTaken":
    case "callParticipants":
    case "mediaNewProducer":
    case "mediaProducerClosed":
    case "callEnded":
      // Ephemeral/call events never touch the query cache - dispatched to
      // their own listener registries below instead (see onTyping/onCallX).
      break;
  }
}

/**
 * Workspace-agnostic counterpart to `useRealtime.ts` - a single global
 * `/ws/chat` connection, mounted once in App.tsx (not per-workspace like
 * `useRealtime`), since DMs and the unified conversation list must work
 * even outside any `/w/:workspaceId` route (e.g. on WorkspacePickerPage).
 * See `modules/realtime/routes.ts`'s doc comment on the server for why this
 * is a second endpoint rather than an optional `workspaceId` on `/ws`.
 *
 * Also carries call push events (`callRing`/`callTaken`/`callParticipants`/
 * `mediaNewProducer`/`mediaProducerClosed`/`callEnded`) over this same
 * socket - `myClientId` (one per browser tab, see clientId.ts) is what lets
 * the server address one specific device/tab rather than every one of a
 * user's open sockets, which calls need and chat itself never did. The
 * actual mediasoup handshake (transports/produce/consume) is REST, not WS -
 * see CallContext.tsx and the calls feature plan for why.
 */
export function useGlobalRealtime(enabled: boolean): {
  sendTyping: (conversationId: string) => void;
  setFocusedConversation: (conversationId: string | null) => void;
  onTyping: (listener: TypingListener) => () => void;
  onCallRing: (listener: CallRingListener) => () => void;
  onCallTaken: (listener: CallTakenListener) => () => void;
  onCallParticipants: (listener: CallParticipantsListener) => () => void;
  onMediaNewProducer: (listener: MediaNewProducerListener) => () => void;
  onMediaProducerClosed: (listener: MediaProducerClosedListener) => () => void;
  onCallEnded: (listener: CallEndedListener) => () => void;
} {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const typingListenersRef = useRef<Set<TypingListener>>(new Set());
  const callRingListenersRef = useRef<Set<CallRingListener>>(new Set());
  const callTakenListenersRef = useRef<Set<CallTakenListener>>(new Set());
  const callParticipantsListenersRef = useRef<Set<CallParticipantsListener>>(new Set());
  const mediaNewProducerListenersRef = useRef<Set<MediaNewProducerListener>>(new Set());
  const mediaProducerClosedListenersRef = useRef<Set<MediaProducerClosedListener>>(new Set());
  const callEndedListenersRef = useRef<Set<CallEndedListener>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = RECONNECT_BASE_DELAY_MS;
    let hasConnectedBefore = false;

    function connect(): void {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat?${new URLSearchParams({ clientId: myClientId }).toString()}`);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = RECONNECT_BASE_DELAY_MS;
        if (hasConnectedBefore) {
          queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
          // A ring that started while this device was disconnected never
          // reached it as a `callRing` WS event - refetch so CallContext.tsx
          // can still pick it up (see its `ringingCall`-driven effect).
          queryClient.invalidateQueries({ queryKey: ["ringingCall"] });
        }
        hasConnectedBefore = true;
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ChatRealtimeMessage;
        switch (payload.type) {
          case "chatTyping":
            for (const listener of typingListenersRef.current) listener(payload.conversationId, payload.userId, payload.userName);
            return;
          case "callRing":
            for (const listener of callRingListenersRef.current) listener(payload.callId, payload.conversationId, payload.initiatorId, payload.initiatorName);
            return;
          case "callTaken":
            for (const listener of callTakenListenersRef.current) listener(payload.callId);
            return;
          case "callParticipants":
            for (const listener of callParticipantsListenersRef.current) listener(payload.callId, payload.conversationId, payload.participants);
            return;
          case "mediaNewProducer":
            for (const listener of mediaNewProducerListenersRef.current)
              listener(payload.callId, payload.producerId, payload.userId, payload.clientId, payload.kind, payload.source);
            return;
          case "mediaProducerClosed":
            for (const listener of mediaProducerClosedListenersRef.current) listener(payload.callId, payload.producerId);
            return;
          case "callEnded":
            for (const listener of callEndedListenersRef.current) listener(payload.callId, payload.conversationId, payload.reason);
            return;
          default:
            handleChatMessage(payload, queryClient);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeout = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
      socketRef.current = null;
    };
  }, [enabled, queryClient]);

  return {
    sendTyping: (conversationId: string) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "typing", conversationId }));
    },
    setFocusedConversation: (conversationId: string | null) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(conversationId ? JSON.stringify({ type: "focus", conversationId }) : JSON.stringify({ type: "unfocus" }));
    },
    onTyping: (listener) => {
      typingListenersRef.current.add(listener);
      return () => typingListenersRef.current.delete(listener);
    },
    onCallRing: (listener) => {
      callRingListenersRef.current.add(listener);
      return () => callRingListenersRef.current.delete(listener);
    },
    onCallTaken: (listener) => {
      callTakenListenersRef.current.add(listener);
      return () => callTakenListenersRef.current.delete(listener);
    },
    onCallParticipants: (listener) => {
      callParticipantsListenersRef.current.add(listener);
      return () => callParticipantsListenersRef.current.delete(listener);
    },
    onMediaNewProducer: (listener) => {
      mediaNewProducerListenersRef.current.add(listener);
      return () => mediaNewProducerListenersRef.current.delete(listener);
    },
    onMediaProducerClosed: (listener) => {
      mediaProducerClosedListenersRef.current.add(listener);
      return () => mediaProducerClosedListenersRef.current.delete(listener);
    },
    onCallEnded: (listener) => {
      callEndedListenersRef.current.add(listener);
      return () => callEndedListenersRef.current.delete(listener);
    },
  };
}
