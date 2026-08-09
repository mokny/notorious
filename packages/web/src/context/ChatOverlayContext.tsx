import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface ChatOverlayValue {
  isOpen: boolean;
  /** Null while showing the conversation list, a conversation id while showing its thread. */
  conversationId: string | null;
  /** Opens the overlay, optionally jumping straight to a thread (e.g. a push-notification deep link). */
  open: (conversationId?: string) => void;
  close: () => void;
  /** Switches between the list (null) and a thread (id) without closing the overlay - the "back" arrow inside ThreadView, and NewChatDialog/NewChannelDialog's onCreated. */
  selectConversation: (conversationId: string | null) => void;
}

const ChatOverlayContext = createContext<ChatOverlayValue | null>(null);

/**
 * Open/closed + "which conversation" state for the chat overlay - shared by
 * ChatBubble.tsx's desktop floating panel and ChatSheet.tsx's mobile
 * slide-up sheet (same pattern as SearchOverlayContext.tsx/SearchSheet.tsx),
 * so both surfaces (and a push-notification deep link, see
 * ChatDeepLinkRoute.tsx) drive the same single overlay instead of each
 * owning separate local state. Deliberately not a route: chat used to be a
 * top-level `/messages` page with no surrounding navigation chrome at all,
 * which trapped a phone user with no way back to whatever they were doing -
 * an overlay on top of the current page fixes that by construction, since
 * closing it just reveals the page underneath unchanged.
 */
export function ChatOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const open = useCallback((id?: string) => {
    setIsOpen(true);
    if (id) setConversationId(id);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const selectConversation = useCallback((id: string | null) => setConversationId(id), []);

  const value = useMemo(() => ({ isOpen, conversationId, open, close, selectConversation }), [isOpen, conversationId, open, close, selectConversation]);
  return <ChatOverlayContext.Provider value={value}>{children}</ChatOverlayContext.Provider>;
}

export function useChatOverlay(): ChatOverlayValue {
  const ctx = useContext(ChatOverlayContext);
  if (!ctx) throw new Error("useChatOverlay must be used within a ChatOverlayProvider");
  return ctx;
}
