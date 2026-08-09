/**
 * Structurally identical to the DOM lib's `RTCIceCandidateInit` - redefined
 * here rather than referencing that type directly, since `packages/shared`
 * has no `DOM` lib (it's also consumed by the Node server, see
 * tsconfig.base.json's `lib: ["ES2022"]`).
 */
export interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/**
 * WebRTC signaling payload relayed verbatim over `/ws/chat` (see
 * `callSignal` in chatRealtime.ts and realtime/routes.ts's relay case) -
 * the server never inspects this, just forwards it to the addressed
 * `{userId, clientId}`. Plain TS, not zod - WS payloads aren't validated
 * anywhere in this codebase today (see chatTyping/chatFocus), staying
 * consistent rather than introducing the first exception.
 */
export type CallSignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: IceCandidateInit };
