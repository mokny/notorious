import type { FastifyInstance } from "fastify";
import { callClientSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireConversationAccess } from "../chat/access.js";
import { getCallsEnabled } from "../instanceSettings/service.js";
import { serviceUnavailable } from "../../lib/httpError.js";
import { getTurnCredentials } from "./turnCredentials.js";
import * as callService from "./service.js";

async function requireCallsEnabled(): Promise<void> {
  if (!(await getCallsEnabled())) throw serviceUnavailable("Calls are not enabled on this server");
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

  // Not scoped to a specific call - TURN credentials are per-user, reusable
  // for whichever call the client is about to join.
  app.get("/api/v1/calls/turn-credentials", async (request) => {
    await requireCallsEnabled();
    const user = requireUser(request);
    return getTurnCredentials(user.id);
  });
}
