import type { ISODateString } from "./entities.js";

/**
 * `ringing`/`missed`/`declined` never transition to `active` - a call only
 * becomes `active` on its first accept, regardless of how many more people
 * join afterward (see chat/calls/service.ts::answerCall). `ended` is the
 * only terminal state reachable from `active`.
 */
export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined";

export interface Call {
  id: string;
  conversationId: string;
  initiatorId: string;
  status: CallStatus;
  startedAt: ISODateString;
  answeredAt: ISODateString | null;
  endedAt: ISODateString | null;
  /** Every user id who was ever an active participant - historical display only ("Alice, Bob missed a call"), never queried per-participant. */
  participantIds: string[];
}

/**
 * Embedded inline on a `Message` whose `callId` is set (see
 * types/chat.ts's `Message.call`) - the same "server resolves the join, the
 * client just renders" idiom `MessageAttachment` already uses. Renders as a
 * compact system-style row instead of a normal chat bubble.
 */
export interface CallSummary {
  callId: string;
  status: CallStatus;
  startedAt: ISODateString;
  /** Only set once `status === "ended"` - `endedAt - answeredAt`. */
  durationSeconds: number | null;
  participantIds: string[];
}

/** `{urls, username, credential}` shape RTCPeerConnection's `iceServers` expects directly - see chat/calls/turnCredentials.ts's coturn `use-auth-secret` scheme. */
export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttlSeconds: number;
}

/** Backs ThreadView's "Call in progress - N participants - Join" banner - see chat/calls/service.ts::getActiveCallSummary, which is backed by in-memory call state, not the DB (which can be stale mid-call). */
export interface ActiveCallSummary {
  callId: string;
  conversationId: string;
  participantUserIds: string[];
}
