import type { FastifyInstance } from "fastify";
import {
  createObjectSchema,
  updateObjectSchema,
  listObjectsQuerySchema,
  createRelationSchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as objectService from "./service.js";
import { completeRecurringTask } from "./recurrence.js";

export async function registerObjectRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/workspaces/:workspaceId/objects", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = createObjectSchema.parse(request.body);
    const object = await objectService.createObject(workspaceId, user.id, input);

    await recordAndBroadcast({
      workspaceId,
      objectId: object.id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "created",
      summary: `${user.name} created "${object.title}"`,
      entity: "object",
      entityId: object.id,
      realtimeAction: "created",
    });

    reply.code(201);
    return object;
  });

  app.get("/api/v1/workspaces/:workspaceId/objects", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    const query = listObjectsQuerySchema.parse(request.query);
    return objectService.queryObjects(workspaceId, {
      objectTypeId: query.objectTypeId,
      archived: query.archived,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

  app.get("/api/v1/objects/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return objectService.getObject(id);
  });

  app.patch("/api/v1/objects/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = updateObjectSchema.parse(request.body);
    const object = await objectService.updateObject(id, input);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} updated "${object.title}"`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
    });

    return object;
  });

  app.post("/api/v1/objects/:id/archive", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await objectService.archiveObject(id);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "archived",
      summary: `${user.name} archived an object`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
    });

    return { ok: true };
  });

  app.post("/api/v1/objects/:id/restore", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await objectService.restoreObject(id);
    return { ok: true };
  });

  app.delete("/api/v1/objects/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await objectService.deleteObject(id);

    await recordAndBroadcast({
      workspaceId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "deleted",
      summary: `${user.name} permanently deleted an object`,
      entity: "object",
      entityId: id,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });

  app.post("/api/v1/objects/:id/complete-recurring", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const result = await completeRecurringTask(id, user.id);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: result.next
        ? `${user.name} completed a task and scheduled the next occurrence`
        : `${user.name} completed a task`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
    });

    return result;
  });

  app.get("/api/v1/objects/:id/backlinks", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return objectService.listBacklinks(id);
  });

  app.post("/api/v1/workspaces/:workspaceId/relations", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = createRelationSchema.parse(request.body);
    const relation = await objectService.createRelation(workspaceId, input);

    await recordAndBroadcast({
      workspaceId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} linked two objects`,
      entity: "relation",
      entityId: relation.id,
      realtimeAction: "created",
    });

    reply.code(201);
    return relation;
  });

  app.delete("/api/v1/workspaces/:workspaceId/relations/by-triple", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const { propertyId, sourceObjectId, targetObjectId } = request.body as {
      propertyId: string;
      sourceObjectId: string;
      targetObjectId: string;
    };
    await objectService.deleteRelationByTriple(propertyId, sourceObjectId, targetObjectId);

    await recordAndBroadcast({
      workspaceId,
      objectId: sourceObjectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} removed a link between two objects`,
      entity: "relation",
      entityId: propertyId,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });

  app.delete("/api/v1/workspaces/:workspaceId/relations/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await objectService.deleteRelation(id);

    await recordAndBroadcast({
      workspaceId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} removed a link between two objects`,
      entity: "relation",
      entityId: id,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });
}
