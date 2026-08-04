import type { FastifyInstance } from "fastify";
import { createBackupDestinationSchema, updateBackupDestinationSchema, backupScheduleSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { badRequest } from "../../lib/httpError.js";
import * as backupService from "./service.js";

/** Extracts a plain string value from a multipart form field, if present - same helper as modules/files/routes.ts. */
function readTextField(field: unknown): string | null {
  if (field && typeof field === "object" && "value" in field && typeof field.value === "string") {
    return field.value;
  }
  return null;
}

export async function registerBackupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/backup", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");

    const zip = await backupService.exportWorkspaceEncrypted(workspaceId);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="workspace-${workspaceId}.zip"`);
    return reply.send(zip);
  });

  app.post("/api/v1/workspaces/import", async (request, reply) => {
    const user = requireUser(request);
    const data = await request.file();
    if (!data) throw badRequest("No backup file was uploaded");

    const buffer = await data.toBuffer();
    const backupKey = readTextField(data.fields.key) ?? undefined;
    const workspace = await backupService.importWorkspace(user.id, buffer, backupKey);
    reply.code(201);
    return workspace;
  });

  app.get("/api/v1/workspaces/:workspaceId/backup/key", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return { key: await backupService.getOrCreateWorkspaceKey(workspaceId) };
  });

  app.post("/api/v1/workspaces/:workspaceId/backup/key/regenerate", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return { key: await backupService.regenerateWorkspaceKey(workspaceId) };
  });

  app.get("/api/v1/workspaces/:workspaceId/backup/destinations", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return backupService.listDestinations(workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/backup/destinations", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = createBackupDestinationSchema.parse(request.body);
    const destination = await backupService.createDestination(workspaceId, input);
    reply.code(201);
    return destination;
  });

  app.patch("/api/v1/workspaces/:workspaceId/backup/destinations/:id", async (request) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = updateBackupDestinationSchema.parse(request.body);
    return backupService.updateDestination(workspaceId, id, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/backup/destinations/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await backupService.deleteDestination(workspaceId, id);
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/backup/destinations/:id/test", async (request) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await backupService.testDestination(workspaceId, id);
    return { ok: true };
  });

  app.get("/api/v1/workspaces/:workspaceId/backup/schedule", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return backupService.getSchedule(workspaceId);
  });

  app.put("/api/v1/workspaces/:workspaceId/backup/schedule", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = backupScheduleSchema.parse(request.body);
    return backupService.upsertSchedule(workspaceId, input);
  });

  app.post("/api/v1/workspaces/:workspaceId/backup/run-now", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await backupService.runBackupNow(workspaceId);
    reply.code(202);
    return backupService.listDestinations(workspaceId);
  });
}
