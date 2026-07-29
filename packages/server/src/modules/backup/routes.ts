import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { badRequest } from "../../lib/httpError.js";
import * as backupService from "./service.js";

export async function registerBackupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/backup", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");

    const zip = await backupService.exportWorkspace(workspaceId);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="workspace-${workspaceId}.zip"`);
    return reply.send(zip);
  });

  app.post("/api/v1/workspaces/import", async (request, reply) => {
    const user = requireUser(request);
    const data = await request.file();
    if (!data) throw badRequest("No backup file was uploaded");

    const buffer = await data.toBuffer();
    const workspace = await backupService.importWorkspace(user.id, buffer);
    reply.code(201);
    return workspace;
  });
}
