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
 *
 * `suppressWhenFocused` mirrors the recipient's `users.push_show_when_open`
 * setting at send time (see push/service.ts::notifyUser) - the service worker
 * reads it to decide whether to skip `showNotification` when one of the
 * user's tabs is focused/visible. Never set on `call`, which always rings
 * regardless of the setting.
 *
 * `comment-reply` is the "you're part of this comment thread" push sent by
 * `notifyCommentParticipants` (modules/notifications/service.ts) - it used to
 * be named `mention` before real @mentions existed; that name is now reserved
 * for `mention` below, sent by `notifyMentionedUsers` when someone is actually
 * @mentioned via `@[Name](user:id)` syntax (see utils/mentions.ts).
 */
export type PushNotificationPayload =
  | { type: "call"; title: string; body: string; callId: string; conversationId: string; tag: string; url: string }
  | { type: "call-closed"; tag: string }
  | { type: "chat-message"; title: string; body: string; conversationId: string; url: string; badge?: number; suppressWhenFocused?: boolean }
  | { type: "chat-reaction"; title: string; body: string; conversationId: string; url: string; suppressWhenFocused?: boolean }
  | { type: "comment-reply" | "mention" | "ai-budget" | "backup-failed" | "reminder" | "auto-update"; title: string; body: string; url: string; suppressWhenFocused?: boolean };
