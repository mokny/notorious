import type { FastifyInstance } from "fastify";
import {
  createObjectSchema,
  updateObjectSchema,
  listObjectsQuerySchema,
  createRelationSchema,
  setObjectLockedSchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess, requireWorkspaceScopedAccess, resolveActor } from "../workspaces/access.js";
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
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceScopedAccess(request, workspaceId, "viewer");
    const query = listObjectsQuerySchema.parse(request.query);
    const result = await objectService.queryObjects(workspaceId, {
      objectTypeId: query.objectTypeId,
      archived: query.archived,
      cursor: query.cursor,
      limit: query.limit,
    });
    if (!request.shareAccess) return result;
    return { ...result, items: result.items.map(objectService.redactScriptForShare) };
  });

  app.get("/api/v1/objects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireAccess(request, workspaceId, "viewer", { objectId: id });
    const object = await objectService.getObject(id);
    return request.shareAccess ? objectService.redactScriptForShare(object) : object;
  });

  app.patch("/api/v1/objects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    const access = await requireAccess(request, workspaceId, "editor", { objectId: id });
    const input = updateObjectSchema.parse(request.body);
    const object = await objectService.updateObject(id, input);

    const { actorId, actorName } = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actorName} updated "${object.title}"`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
    });

    return request.shareAccess ? objectService.redactScriptForShare(object) : object;
  });

  // Owner-only, and deliberately NOT routed through `requireAccess` (which
  // would reject the request the moment the object is already locked,
  // making it impossible to ever unlock again) - locking/unlocking is the
  // one action that must always be available to the owner regardless of
  // the object's current lock state.
  app.post("/api/v1/objects/:id/lock", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = setObjectLockedSchema.parse(request.body);
    const object = await objectService.setObjectLocked(id, input.locked ? user.id : null, input.locked);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: input.locked ? `${user.name} locked "${object.title}"` : `${user.name} unlocked "${object.title}"`,
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
    await objectService.assertObjectEditable(id);
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
    // This route (unlike blocks/object-property routes) authorizes via
    // `requireWorkspaceRole`, not `requireAccess`, so it doesn't get the lock
    // check `requireAccess` runs automatically for an object-scoped editor+
    // request - checked explicitly here instead.
    await objectService.assertObjectEditable(input.sourceObjectId);
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
    await objectService.assertObjectEditable(sourceObjectId);
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
