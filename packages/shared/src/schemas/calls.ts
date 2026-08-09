import { z } from "zod";

/**
 * Every call REST action needs to know which of the caller's several open
 * tabs/devices is acting - the same `clientId` concept the `/ws/chat`
 * socket connects with (see lib/ws/useGlobalRealtime.ts on the frontend) -
 * so the server's in-memory call state (chat/calls/callState.ts) can track
 * per-device participation, not just per-user.
 */
export const callClientSchema = z.object({
  clientId: z.string().min(1),
});
export type CallClientInput = z.infer<typeof callClientSchema>;

/**
 * The mediasoup handshake bodies below all carry opaque JSON blobs
 * (RTP capabilities/parameters, DTLS parameters) that mediasoup/
 * mediasoup-client validate internally - this layer only checks "is it an
 * object", not its contents, same reasoning as `types/media.ts` typing them
 * as `Record<string, unknown>` instead of redefining mediasoup's types.
 */
const opaqueParams = z.record(z.string(), z.unknown());

export const createTransportSchema = callClientSchema.extend({
  direction: z.enum(["send", "recv"]),
});
export type CreateTransportInput = z.infer<typeof createTransportSchema>;

export const connectTransportSchema = callClientSchema.extend({
  dtlsParameters: opaqueParams,
});
export type ConnectTransportInput = z.infer<typeof connectTransportSchema>;

export const produceSchema = callClientSchema.extend({
  kind: z.enum(["audio", "video"]),
  rtpParameters: opaqueParams,
  source: z.enum(["mic", "camera", "screen"]),
});
export type ProduceInput = z.infer<typeof produceSchema>;

export const consumeSchema = callClientSchema.extend({
  transportId: z.string().min(1),
  producerId: z.string().min(1),
  rtpCapabilities: opaqueParams,
});
export type ConsumeInput = z.infer<typeof consumeSchema>;
