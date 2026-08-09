import type { FastifyInstance } from "fastify";
import { callClientSchema, createTransportSchema, connectTransportSchema, produceSchema, consumeSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireConversationAccess } from "../chat/access.js";
import { getCallsEnabled } from "../instanceSettings/service.js";
import { serviceUnavailable, unauthorized } from "../../lib/httpError.js";
import * as callService from "./service.js";
import * as callState from "./callState.js";
import * as sfu from "./sfu.js";

async function requireCallsEnabled(): Promise<void> {
  if (!(await getCallsEnabled())) throw serviceUnavailable("Calls are not enabled on this server");
}

/** Every mediasoup signaling route is scoped to a call the caller has already joined (via /answer, which registers them in callState) - this is the sole authorization boundary for all of them, mirroring how `chat/access.ts::requireConversationAccess` gates chat REST calls. */
function requireCallParticipant(callId: string, userId: string, clientId: string): void {
  const isParticipant = callState.getParticipants(callId).some((p) => p.userId === userId && p.clientId === clientId);
  if (!isParticipant) throw unauthorized("You haven't joined this call");
}

export async function registerCallRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat/conversations/:id/calls", async (request, reply) => {
    await requireCallsEnabled();
    const { id } = request.params as { id: string };
    const access = await requireConversationAccess(request, id);
    const user = requireUser(request);
    const call = await callService.startCall(id, access.userId, user.name);
    reply.code(201);
    return call;
  });

  app.get("/api/v1/chat/conversations/:id/active-call", async (request) => {
    await requireCallsEnabled();
    const { id } = request.params as { id: string };
    await requireConversationAccess(request, id);
    return callService.getActiveCallSummary(id);
  });

  /** "Is there a call ringing for me right now" - see CallContext.tsx's initial fetch on mount/reconnect, which is what lets a cold-started tab (e.g. opened by tapping a push notification) show the accept/decline banner instead of missing it. */
  app.get("/api/v1/calls/ringing", async (request) => {
    await requireCallsEnabled();
    const user = requireUser(request);
    return callService.getRingingCallForUser(user.id);
  });

  app.post("/api/v1/calls/:callId/answer", async (request) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const user = requireUser(request);
    const input = callClientSchema.parse(request.body);
    return callService.answerCall(callId, user.id, input.clientId);
  });

  app.post("/api/v1/calls/:callId/decline", async (request, reply) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const user = requireUser(request);
    await callService.declineCall(callId, user.id);
    reply.code(204);
  });

  app.post("/api/v1/calls/:callId/leave", async (request, reply) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const user = requireUser(request);
    const input = callClientSchema.parse(request.body);
    await callService.leaveCall(callId, user.id, input.clientId);
    reply.code(204);
  });

  // --- mediasoup handshake - REST request/response, see the calls feature
  // plan for why (the /ws/chat channel is fire-and-forget broadcast only,
  // no request/response infra exists there to reuse). Every route requires
  // the caller to already be a registered participant of :callId (see
  // requireCallParticipant above).

  app.get("/api/v1/calls/:callId/rtp-capabilities", async (request) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const { clientId } = request.query as { clientId?: string };
    const user = requireUser(request);
    requireCallParticipant(callId, user.id, clientId ?? "");
    return sfu.getRtpCapabilities(callId);
  });

  app.post("/api/v1/calls/:callId/transports", async (request) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const user = requireUser(request);
    const input = createTransportSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    return sfu.createTransport(user.id, input.clientId, callId, input.direction);
  });

  app.post("/api/v1/calls/:callId/transports/:transportId/connect", async (request, reply) => {
    await requireCallsEnabled();
    const { callId, transportId } = request.params as { callId: string; transportId: string };
    const user = requireUser(request);
    const input = connectTransportSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    await sfu.connectTransport(user.id, input.clientId, transportId, input.dtlsParameters);
    reply.code(204);
  });

  app.post("/api/v1/calls/:callId/transports/:transportId/produce", async (request, reply) => {
    await requireCallsEnabled();
    const { callId, transportId } = request.params as { callId: string; transportId: string };
    const user = requireUser(request);
    const input = produceSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    const result = await sfu.produce(user.id, input.clientId, callId, transportId, input.kind, input.rtpParameters, input.source);
    reply.code(201);
    return result;
  });

  app.post("/api/v1/calls/:callId/producers/:producerId/close", async (request, reply) => {
    await requireCallsEnabled();
    const { callId, producerId } = request.params as { callId: string; producerId: string };
    const user = requireUser(request);
    const input = callClientSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    sfu.closeProducer(user.id, input.clientId, callId, producerId);
    reply.code(204);
  });

  app.get("/api/v1/calls/:callId/producers", async (request) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const { clientId } = request.query as { clientId?: string };
    const user = requireUser(request);
    requireCallParticipant(callId, user.id, clientId ?? "");
    return sfu.listProducers(callId, user.id, clientId ?? "");
  });

  app.post("/api/v1/calls/:callId/consume", async (request) => {
    await requireCallsEnabled();
    const { callId } = request.params as { callId: string };
    const user = requireUser(request);
    const input = consumeSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    return sfu.consume(user.id, input.clientId, callId, input.transportId, input.producerId, input.rtpCapabilities);
  });

  app.post("/api/v1/calls/:callId/consumers/:consumerId/resume", async (request, reply) => {
    await requireCallsEnabled();
    const { callId, consumerId } = request.params as { callId: string; consumerId: string };
    const user = requireUser(request);
    const input = callClientSchema.parse(request.body);
    requireCallParticipant(callId, user.id, input.clientId);
    await sfu.resumeConsumer(user.id, input.clientId, consumerId);
    reply.code(204);
  });
}
