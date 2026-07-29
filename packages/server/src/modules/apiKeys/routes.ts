import type { FastifyInstance } from "fastify";
import { createApiKeySchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import * as apiKeyService from "./service.js";

export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/api-keys", async (request) => {
    const user = requireUser(request);
    return apiKeyService.listApiKeys(user.id);
  });

  app.post("/api/v1/api-keys", async (request, reply) => {
    const user = requireUser(request);
    const input = createApiKeySchema.parse(request.body);
    const apiKey = await apiKeyService.createApiKey(user.id, input.name);
    reply.code(201);
    return apiKey;
  });

  app.delete("/api/v1/api-keys/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await apiKeyService.revokeApiKey(user.id, id);
    reply.code(204);
  });
}
