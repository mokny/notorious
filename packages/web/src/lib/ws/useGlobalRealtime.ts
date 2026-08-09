import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ChatRealtimeMessage } from "@notorious/shared";
import { clientId as myClientId } from "./clientId.js";
import { updateAppBadge } from "../chatBadge.js";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

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
    case "chatTyping":
      // Ephemeral, never touches the query cache - ThreadView.tsx listens for
      // this directly via `onTyping` below instead.
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
 */
export function useGlobalRealtime(enabled: boolean): {
  sendTyping: (conversationId: string) => void;
  setFocusedConversation: (conversationId: string | null) => void;
  onTyping: (listener: (conversationId: string, userId: string, userName: string) => void) => () => void;
} {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const typingListenersRef = useRef<Set<(conversationId: string, userId: string, userName: string) => void>>(new Set());

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
        if (hasConnectedBefore) queryClient.invalidateQueries({ queryKey: ["chatConversations"] });
        hasConnectedBefore = true;
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ChatRealtimeMessage;
        if (payload.type === "chatTyping") {
          for (const listener of typingListenersRef.current) listener(payload.conversationId, payload.userId, payload.userName);
          return;
        }
        handleChatMessage(payload, queryClient);
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
  };
}
