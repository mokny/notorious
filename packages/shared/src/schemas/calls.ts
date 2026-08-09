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
