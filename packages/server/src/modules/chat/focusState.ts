import type { WebSocket } from "@fastify/websocket";

/**
 * Tracks which conversation (if any) each open `/ws/chat` socket is
 * currently looking at - private per-user state, never broadcast to other
 * users (unlike object presence's multi-viewer avatar list in
 * `modules/presence/`), used only to suppress a push notification when the
 * recipient is already watching the conversation live over the socket (see
 * `notifyNewMessage` in service.ts). Keyed by socket rather than just
 * userId, since one user's several open tabs/devices can each be focused on
 * a different conversation (or none) - a push should only be suppressed if
 * at least one of them is looking at the right one.
 *
 * No TTL sweep like `presence/state.ts` needs - that module's state is
 * driven by an HTTP heartbeat that can go stale if a tab dies without
 * firing an unload. This one is driven directly by the WebSocket's own
 * "close" event (see realtime/routes.ts), which fires reliably whenever the
 * socket goes away, so there's nothing to sweep.
 */
const focusBySocket = new Map<WebSocket, { userId: string; conversationId: string }>();

export function touchFocus(userId: string, conversationId: string, socket: WebSocket): void {
  focusBySocket.set(socket, { userId, conversationId });
}

export function clearFocus(socket: WebSocket): void {
  focusBySocket.delete(socket);
}

export function isFocused(userId: string, conversationId: string): boolean {
  for (const entry of focusBySocket.values()) {
    if (entry.userId === userId && entry.conversationId === conversationId) return true;
  }
  return false;
}
