import type { FastifyInstance } from "fastify";
import {
  createObjectSchema,
  updateObjectSchema,
  listObjectsQuerySchema,
  createRelationSchema,
  setObjectLockedSchema,
  setCommentsDisabledSchema,
  setObjectRequiresReverifySchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess, requireWorkspaceScopedAccess, resolveActor } from "../workspaces/access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as objectService from "./service.js";
import { completeRecurringTask } from "./recurrence.js";
import { isSudoActive } from "../reverify/service.js";

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
    const hasSudo = await isSudoActive(request);
    const items = result.items.map((item) => objectService.redactForReverify(request.shareAccess ? objectService.redactScriptForShare(item) : item, hasSudo));
    return { ...result, items };
  });

  app.get("/api/v1/objects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireAccess(request, workspaceId, "viewer", { objectId: id });
    const object = await objectService.getObject(id);
    return request.shareAccess ? objectService.redactScriptForShare(object) : object;
  });

  // Deliberately the one read that's allowed to see a `requiresReverify`
  // object's title/icon without a completed reverify - used for mention/link
  // previews (see web's useObjectTitle.ts) so a linked vault object shows its
  // real title instead of "Untitled". Same object-scoping as the full GET
  // above (a single-object share still only reaches its own object), just
  // without the hard 428 - see access.ts's `skipReverifyGate`.
  app.get("/api/v1/objects/:id/summary", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireAccess(request, workspaceId, "viewer", { objectId: id, skipReverifyGate: true });
    const object = await objectService.getObject(id);
    const hasSudo = await isSudoActive(request);
    const redacted = objectService.redactForReverify(object, hasSudo);
    return request.shareAccess ? objectService.redactScriptForShare(redacted) : redacted;
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

  // Owner-only, and - like the lock endpoint above - deliberately NOT routed
  // through `requireAccess`, so the owner can always reach this regardless of
  // the object's own lock state (a locked object with comments still enabled
  // should stay that way until the owner explicitly changes it, not become
  // unreachable).
  app.post("/api/v1/objects/:id/comments-disabled", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = setCommentsDisabledSchema.parse(request.body);
    const object = await objectService.setCommentsDisabled(id, input.disabled);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: input.disabled ? `${user.name} disabled comments on "${object.title}"` : `${user.name} enabled comments on "${object.title}"`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
    });

    return object;
  });

  // Owner-only, and - like the lock/comments-disabled endpoints above -
  // deliberately NOT routed through `requireAccess`, which would otherwise
  // refuse this very request the moment the object is already protected
  // (assertReverifyAccess has no exception for "the request that's about to
  // turn the protection back off"), making it impossible to ever unprotect
  // an object without reverifying first - not the intended UX for the owner
  // who just set it up. Reads (GET /api/v1/objects/:id) still enforce it
  // normally.
  app.post("/api/v1/objects/:id/requires-reverify", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = setObjectRequiresReverifySchema.parse(request.body);
    const object = await objectService.setObjectRequiresReverify(id, input.requiresReverify);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: input.requiresReverify ? `${user.name} protected "${object.title}"` : `${user.name} unprotected "${object.title}"`,
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

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} restored an object`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
      // `action: "updated"` has no dedicated "restored" case in the shared
      // activity-action enum (see activity.ts) - this override keeps
      // webhooks distinguishing a restore from a generic property edit
      // without expanding that enum just for this.
      webhookEvent: "object.restored",
    });

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
