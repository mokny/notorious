import { useEffect, useRef } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useChatOverlay } from "../context/ChatOverlayContext.js";
import { useCall } from "../context/CallContext.js";

/**
 * `/messages/:conversationId` deep-link shim (see ChatListPage.tsx's doc
 * comment) - this is what a push notification's `url` actually points at
 * (see chat/service.ts::notifyNewMessage on the server). Opens the overlay
 * straight to that thread, then redirects home.
 *
 * A `?join=<callId>` param (only ever added by push-sw.ts's "Accept" call
 * notification action) auto-joins that call instead of just showing the
 * incoming-call banner - the explicit tap on the notification's Accept
 * button already *is* the user's confirmation, same as tapping Accept in
 * the banner itself.
 */
export function ChatThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const { open } = useChatOverlay();
  const { joinCall } = useCall();
  const joinCallId = searchParams.get("join");
  const joinedRef = useRef(false);

  useEffect(() => {
    if (conversationId) open(conversationId);
  }, [conversationId, open]);

  useEffect(() => {
    if (!conversationId || !joinCallId || joinedRef.current) return;
    joinedRef.current = true;
    joinCall(joinCallId, conversationId).catch(() => {});
    // `joinCall` intentionally omitted - identity changes every render and
    // this must fire exactly once per mount (see `joinedRef`), not on every
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, joinCallId]);

  return <Navigate to="/" replace />;
}
