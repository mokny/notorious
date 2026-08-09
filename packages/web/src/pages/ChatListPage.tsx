import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useChatOverlay } from "../context/ChatOverlayContext.js";

/**
 * `/messages` is no longer a real page - chat lives in the overlay
 * (ChatBubble.tsx / ChatSheet.tsx, see ChatOverlayContext.tsx). This route
 * only exists so an old bookmark/link still does something useful: open the
 * overlay and redirect to home, which becomes "whatever's behind it".
 */
export function ChatListPage() {
  const { open } = useChatOverlay();
  useEffect(() => open(), [open]);
  return <Navigate to="/" replace />;
}
