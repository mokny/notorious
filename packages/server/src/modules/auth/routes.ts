import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@notorious/shared";
import { registerUser, verifyCredentials, getUserById } from "./service.js";
import { createSession, destroySession, requireUser } from "../../plugins/session.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(input);
    await createSession(reply, user.id);
    reply.code(201);
    return user;
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await verifyCredentials(input);
    await createSession(reply, user.id);
    return user;
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await destroySession(request, reply);
    reply.code(204);
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const authUser = requireUser(request);
    const user = await getUserById(authUser.id);
    if (!user) {
      reply.code(401);
      return { message: "Session is no longer valid" };
    }
    return user;
  });
}
