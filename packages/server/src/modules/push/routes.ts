import type { FastifyInstance } from "fastify";
import { pushSubscribeSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { env } from "../../env.js";
import * as pushService from "./service.js";

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/push/vapid-public-key", async () => {
    return { publicKey: env.vapidPublicKey };
  });

  app.post("/api/v1/push/subscribe", async (request, reply) => {
    const user = requireUser(request);
    const input = pushSubscribeSchema.parse(request.body);
    await pushService.subscribe(user.id, input);
    reply.code(201);
    return { ok: true };
  });

  app.post("/api/v1/push/unsubscribe", async (request) => {
    requireUser(request);
    const { endpoint } = request.body as { endpoint: string };
    await pushService.unsubscribe(endpoint);
    return { ok: true };
  });
}
