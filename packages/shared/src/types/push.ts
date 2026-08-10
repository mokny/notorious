/**
 * Shape of the JSON body sent through Web Push (see push/service.ts::notifyUser
 * on the server) and read back by the service worker's `push`/`notificationclick`
 * handlers (push-sw.ts). `type` lets the service worker special-case an incoming
 * call (action buttons, requireInteraction, tag-based close) without having to
 * infer intent from the shape of `url`.
 *
 * `call-closed` carries no visible title/body - it's a silent signal telling the
 * service worker to close an already-shown, same-`tag` call notification (the
 * call ended/was answered elsewhere/timed out) - see calls/service.ts::endCall.
 */
export type PushNotificationPayload =
  | { type: "call"; title: string; body: string; callId: string; conversationId: string; tag: string; url: string }
  | { type: "call-closed"; tag: string }
  | { type: "chat-message"; title: string; body: string; conversationId: string; url: string; badge?: number }
  | { type: "chat-reaction"; title: string; body: string; conversationId: string; url: string }
  | { type: "mention" | "ai-budget" | "backup-failed" | "reminder"; title: string; body: string; url: string };
