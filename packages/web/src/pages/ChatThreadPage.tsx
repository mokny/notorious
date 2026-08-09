import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useChatOverlay } from "../context/ChatOverlayContext.js";

/**
 * `/messages/:conversationId` deep-link shim (see ChatListPage.tsx's doc
 * comment) - this is what a push notification's `url` actually points at
 * (see chat/service.ts::notifyNewMessage on the server). Opens the overlay
 * straight to that thread, then redirects home.
 */
export function ChatThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { open } = useChatOverlay();

  useEffect(() => {
    if (conversationId) open(conversationId);
  }, [conversationId, open]);

  return <Navigate to="/" replace />;
}
