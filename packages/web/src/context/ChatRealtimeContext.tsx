import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi } from "../lib/api/resources.js";
import { useGlobalRealtime } from "../lib/ws/useGlobalRealtime.js";
import { updateAppBadge } from "../lib/chatBadge.js";
import { useAuth } from "./AuthContext.js";

type ChatRealtimeContextValue = ReturnType<typeof useGlobalRealtime>;

const ChatRealtimeContext = createContext<ChatRealtimeContextValue | null>(null);

/**
 * Mounted once in App.tsx, outside `<Routes>`, so the global `/ws/chat`
 * socket and the unified conversation list stay alive across every route -
 * including WorkspacePickerPage, which has no `/w/:workspaceId` at all (see
 * useGlobalRealtime.ts's doc comment). Also owns the cold-load app-badge
 * fallback: `useGlobalRealtime`'s `chatUnreadCount` WS event is the live
 * update path, but the very first paint (before any WS event has arrived)
 * needs *something* to set the badge from, so this derives it once from the
 * initial conversation-list fetch too.
 *
 * The whole `useGlobalRealtime` return value is passed through as-is
 * (rather than re-destructured field by field) so CallContext.tsx (nested
 * inside this provider) gets the call-signaling methods
 * (`onCallRing`/`sendCallSignal`/...) without this file needing to know
 * about every one of them individually.
 */
export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const realtime = useGlobalRealtime(Boolean(user));

  const { data: conversations } = useQuery({
    queryKey: ["chatConversations"],
    queryFn: chatApi.listConversations,
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!conversations) return;
    updateAppBadge(conversations.filter((c) => c.unreadCount > 0).length);
  }, [conversations]);

  return <ChatRealtimeContext.Provider value={realtime}>{children}</ChatRealtimeContext.Provider>;
}

export function useChatRealtime(): ChatRealtimeContextValue {
  const ctx = useContext(ChatRealtimeContext);
  if (!ctx) throw new Error("useChatRealtime must be used within ChatRealtimeProvider");
  return ctx;
}
