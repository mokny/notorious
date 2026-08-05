import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { badRequest } from "../../lib/httpError.js";
import * as usersService from "./service.js";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/users/me/avatar", async (request, reply) => {
    const user = requireUser(request);

    const data = await request.file({ limits: { fileSize: MAX_AVATAR_SIZE } });
    if (!data) throw badRequest("No file was uploaded");

    const buffer = await data.toBuffer();
    const avatarUrl = await usersService.saveAvatar(user.id, data.mimetype, buffer);

    reply.code(201);
    return { avatarUrl };
  });

  app.delete("/api/v1/users/me/avatar", async (request, reply) => {
    const user = requireUser(request);
    await usersService.deleteAvatar(user.id);
    reply.code(204);
  });

  // Not scoped to a workspace/`requireAccess`, unlike `modules/files` - an
  // avatar isn't workspace-scoped data, it just needs *a* logged-in viewer
  // (any workspace member seeing this user's name elsewhere - WorkspaceLayout,
  // SettingsPage's member list - needs to be able to load it too).
  app.get("/api/v1/users/:userId/avatar", async (request, reply) => {
    requireUser(request);
    const { userId } = request.params as { userId: string };
    const { path: filePath, mimeType } = await usersService.getAvatarFile(userId);

    reply.header("Content-Type", mimeType);
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.send(fs.createReadStream(filePath));
  });
}
